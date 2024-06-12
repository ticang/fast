import { Types, connectionMongo } from '../../mongo';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import fsp from 'fs/promises';
import fs from 'fs';
import { DatasetFileSchema } from '@fastgpt/global/core/dataset/type';
import { MongoFileSchema } from './schema';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { MongoRawTextBuffer } from '../../buffer/rawText/schema';
import { readRawContentByFileBuffer } from '../read/utils';
import { gridFsStream2Buffer } from './utils';

export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoFileSchema;
  return connectionMongo.connection.db.collection(`${bucket}.files`);
}
export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db, {
    bucketName: bucket
  });
}

/* crud  file */
export async function uploadFile({
  bucketName,
  teamId,
  tmbId,
  path,
  filename,
  contentType,
  metadata = {}
}: {
  bucketName: `${BucketNameEnum}`;
  teamId: string;
  tmbId: string;
  path: string;
  filename: string;
  contentType?: string;
  metadata?: Record<string, any>;
}) {
  if (!path) return Promise.reject(`filePath is empty`);
  if (!filename) return Promise.reject(`filename is empty`);

  const stats = await fsp.stat(path);
  if (!stats.isFile()) return Promise.reject(`${path} is not a file`);

  metadata.teamId = teamId;
  metadata.tmbId = tmbId;

  // create a gridfs bucket
  const bucket = getGridBucket(bucketName);

  const stream = bucket.openUploadStream(filename, {
    metadata,
    contentType
  });

  // save to gridfs
  await new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(stream as any)
      .on('finish', resolve)
      .on('error', reject);
  });

  return String(stream.id);
}

export async function getFileById({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) {
  const db = getGFSCollection(bucketName);
  const file = await db.findOne<DatasetFileSchema>({
    _id: new Types.ObjectId(fileId)
  });

  // if (!file) {
  //   return Promise.reject('File not found');
  // }

  return file || undefined;
}

export async function delFileByFileIdList({
  bucketName,
  fileIdList,
  retry = 3
}: {
  bucketName: `${BucketNameEnum}`;
  fileIdList: string[];
  retry?: number;
}): Promise<any> {
  try {
    const bucket = getGridBucket(bucketName);

    await Promise.all(fileIdList.map((id) => bucket.delete(new Types.ObjectId(id))));
  } catch (error) {
    if (retry > 0) {
      return delFileByFileIdList({ bucketName, fileIdList, retry: retry - 1 });
    }
  }
}

export async function getDownloadStream({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) {
  const bucket = getGridBucket(bucketName);
  const encodeStream = bucket.openDownloadStream(new Types.ObjectId(fileId), { end: 100 });
  const rawStream = bucket.openDownloadStream(new Types.ObjectId(fileId));

  /* get encoding */
  const buffer = await gridFsStream2Buffer(encodeStream);

  const encoding = detectFileEncoding(buffer);

  return {
    fileStream: rawStream,
    encoding
    // encoding: 'utf-8'
  };
}

export const readFileContentFromMongo = async ({
  teamId,
  bucketName,
  fileId,
  isQAImport = false
}: {
  teamId: string;
  bucketName: `${BucketNameEnum}`;
  fileId: string;
  isQAImport?: boolean;
}): Promise<{
  rawText: string;
  filename: string;
}> => {
  // read buffer
  const fileBuffer = await MongoRawTextBuffer.findOne({ sourceId: fileId }).lean();
  if (fileBuffer) {
    return {
      rawText: fileBuffer.rawText,
      filename: fileBuffer.metadata?.filename || ''
    };
  }
  const start = Date.now();

  const [file, { encoding, fileStream }] = await Promise.all([
    getFileById({ bucketName, fileId }),
    getDownloadStream({ bucketName, fileId })
  ]);
  // console.log('get file stream', Date.now() - start);
  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const extension = file?.filename?.split('.')?.pop()?.toLowerCase() || '';

  const fileBuffers = await gridFsStream2Buffer(fileStream);
  // console.log('get file buffer', Date.now() - start);

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    isQAImport,
    teamId,
    buffer: fileBuffers,
    encoding,
    metadata: {
      relatedId: fileId
    }
  });

  if (rawText.trim()) {
    MongoRawTextBuffer.create({
      sourceId: fileId,
      rawText,
      metadata: {
        filename: file.filename
      }
    });
  }

  return {
    rawText,
    filename: file.filename
  };
};
