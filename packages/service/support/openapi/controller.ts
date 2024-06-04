import { MongoOpenApi } from './schema';

export async function findOpenApiOrCreate({
  appId,
  name,
  teamId,
  tmbId,
  limit
}: {
  appId: string;
  name: string;
  teamId: string;
  tmbId: string;
  limit?: object;
}): Promise<String> {
  const openApi = await MongoOpenApi.findOne({
    teamId,
    tmbId,
    name,
    appId
  });

  if (openApi) {
    return openApi.apiKey;
  }
  const nanoid = appId;
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

  await MongoOpenApi.create({
    teamId,
    tmbId,
    apiKey,
    appId,
    name,
    limit
  });

  return apiKey;
}
