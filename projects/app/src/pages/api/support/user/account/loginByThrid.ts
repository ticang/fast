import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { clearCookie, createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { connectToDatabase } from '@/service/mongo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createUserTeam } from '@fastgpt/service/support/user/team/controller';
import { PRICE_SCALE } from '@fastgpt/global/support/wallet/constants';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { findDatasetOrCreate } from '@fastgpt/service/core/dataset/controller';
import { findAppOrCreate } from '@fastgpt/service/core/app/controller';
import { defaultTemplates } from '@/web/core/app/defaultTemplates';
import { findOpenApiOrCreate } from '@fastgpt/service/support/openapi/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await Promise.all([withNextCors(req, res), connectToDatabase()]);
    const { username } = req.query as { username: string };
    let { app } = req.query as { app: string };
    let { data } = req.query as { data: string };
    if (app === null || app === undefined) {
      app = username;
    }
    if (data === null || data === undefined) {
      data = username;
    }
    if (!username) {
      throw new Error('缺少参数');
    }
    const psw = process.env.DEFAULT_ROOT_PSW || '1234';
    // 检测用户是否存在
    const [authCert] = await Promise.all([
      MongoUser.findOne(
        {
          username
        },
        'status'
      )
    ]);
    if (!authCert) {
      await mongoSessionRun(async (session) => {
        let rootId = '';
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: username,
              password: hashStr(psw)
            }
          ],
          { session }
        );
        rootId = _id;
        // init root team
        await createUserTeam({
          userId: _id,
          teamName: 'root',
          balance: 9999 * PRICE_SCALE,
          session
        });
      });
    }

    // if (authCert.status === UserStatusEnum.forbidden) {
    //   throw new Error('账号已停用，无法登录');
    // }

    const user = await MongoUser.findOne({
      username
    });

    if (!user) {
      throw new Error('用户创建失败');
    }

    const userDetail = await getUserDetail({
      tmbId: user?.lastLoginTmbId,
      userId: user._id
    });

    MongoUser.findByIdAndUpdate(user._id, {
      lastLoginTmbId: userDetail.team.tmbId
    });

    const token = createJWT(userDetail);
    setCookie(res, token);

    let tmbId = userDetail.team.tmbId;
    let teamId = userDetail.team.teamId;

    //create dataset
    const datasetId = await findDatasetOrCreate({
      avatar: '/icon/logo.svg',
      name: data,
      intro: '',
      type: 'dataset',
      teamId: teamId,
      tmbId: tmbId,
      vectorModel: 'bge-large-zh-v1.5-local',
      agentModel: 'chatglm3-6b'
    });
    if (datasetId === null || datasetId === undefined) {
      throw new Error('知识库创建失败');
    }
    //create app
    const appId = await findAppOrCreate({
      avatar: defaultTemplates[0].avatar,
      name: app,
      teamId: teamId,
      tmbId: tmbId,
      datasetId: datasetId.toString(),
      modules: defaultTemplates[0].modules,
      edges: defaultTemplates[0].edges,
      type: defaultTemplates[0].type
    });
    if (appId === null || appId === undefined) {
      throw new Error('应用创建失败');
    }
    const apiKey = await findOpenApiOrCreate({
      name: app,
      teamId: teamId,
      tmbId: tmbId,
      appId: appId.toString(),
      limit: { maxUsagepoints: -1 }
    });
    if (apiKey === null || apiKey === undefined) {
      throw new Error('API创建失败');
    }
    jsonRes(res, {
      data: {
        user: userDetail,
        tmbId: tmbId,
        teamId: teamId,
        datasetId: datasetId,
        appId: appId,
        apiKey: apiKey,
        token
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
