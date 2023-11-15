import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { findDatasetIdTreeByTopDatasetId } from '@fastgpt/service/core/dataset/controller';
import { Readable } from 'stream';
import type { Cursor } from '@fastgpt/service/common/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let { datasetId } = req.query as {
      datasetId: string;
    };

    if (!datasetId || !global.pgClient) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authDataset({ req, authToken: true, datasetId, per: 'w' });

    const exportIds = await findDatasetIdTreeByTopDatasetId(datasetId);

    const limitMinutesAgo = new Date(
      Date.now() - (global.feConfigs?.limit?.exportLimitMinutes || 0) * 60 * 1000
    );

    // auth export times
    const authTimes = await MongoUser.findOne(
      {
        _id: userId,
        $or: [
          { 'limit.exportKbTime': { $exists: false } },
          { 'limit.exportKbTime': { $lte: limitMinutesAgo } }
        ]
      },
      '_id limit'
    );

    if (!authTimes) {
      const minutes = `${global.feConfigs?.limit?.exportLimitMinutes || 0} 分钟`;
      throw new Error(`上次导出未到 ${minutes}，每 ${minutes}仅可导出一次。`);
    }

    // auth max data
    const total = await MongoDatasetData.countDocuments({
      datasetId: { $in: exportIds }
    });

    addLog.info(`export datasets: ${datasetId}`, { total });

    if (total > 100000) {
      throw new Error('数据量超出 10 万，无法导出');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
    res.setHeader('Content-Disposition', 'attachment; filename=dataset.csv; ');

    const cursor = MongoDatasetData.find<{
      _id: string;
      collectionId: { name: string };
      q: string;
      a: string;
    }>(
      {
        datasetId: { $in: exportIds }
      },
      'q a'
    ).cursor();

    function cursorToReadableStream(cursor: Cursor) {
      const readable = new Readable({
        objectMode: true,
        read() {}
      });

      readable.push(`\uFEFFindex,content`);

      cursor.on('data', (doc) => {
        const q = doc.q.replace(/"/g, '""') || '';
        const a = doc.a.replace(/"/g, '""') || '';

        readable.push(`\n"${q}","${a}"`);
      });

      cursor.on('end', async () => {
        readable.push(null);
        cursor.close();
        await MongoUser.findByIdAndUpdate(userId, {
          'limit.exportKbTime': new Date()
        });
      });

      return readable;
    }

    // @ts-ignore
    const stream = cursorToReadableStream(cursor);
    stream.pipe(res);
  } catch (err) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
