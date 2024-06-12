import { AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getLLMModel } from '../ai/model';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoApp } from './schema';
import * as console from 'console';
import { MongoAppVersion } from './version/schema';

export const beforeUpdateAppFormat = <T extends AppSchema['modules'] | undefined>({
  nodes
}: {
  nodes: T;
}) => {
  if (nodes) {
    let maxTokens = 3000;

    nodes.forEach((item) => {
      if (
        item.flowNodeType === FlowNodeTypeEnum.chatNode ||
        item.flowNodeType === FlowNodeTypeEnum.tools
      ) {
        const model =
          item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
        const chatModel = getLLMModel(model);
        const quoteMaxToken = chatModel.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    nodes.forEach((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
        item.inputs.forEach((input) => {
          if (input.key === NodeInputKeyEnum.datasetMaxTokens) {
            const val = input.value as number;
            if (val > maxTokens) {
              input.value = maxTokens;
            }
          }
        });
      }
    });
  }

  return {
    nodes
  };
};

export const getAppLatestVersion = async (appId: string, app?: AppSchema) => {
  const version = await MongoAppVersion.findOne({
    appId
  }).sort({
    time: -1
  });

  if (version) {
    return {
      nodes: version.nodes,
      edges: version.edges,
      chatConfig: version.chatConfig || app?.chatConfig || {}
    };
  }
  return {
    nodes: app?.modules || [],
    edges: app?.edges || [],
    chatConfig: app?.chatConfig || {}
  };
};

export async function findAppOrCreate({
  avatar,
  name,
  teamId,
  tmbId,
  datasetId,
  modules,
  edges,
  type
}: {
  avatar?: string;
  name?: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
  type?: `${AppTypeEnum}`;
}): Promise<String> {
  console.log('dataset->', datasetId);
  const app = await MongoApp.findOne({
    teamId,
    tmbId,
    name,
    type
  });
  if (app) {
    return app._id;
  }

  //设置datasetId
  modules.forEach((item) => {
    if ('iKBoX2vIzETU' === item.nodeId) {
      item.inputs.forEach((input) => {
        if ('datasets' === input.key) {
          input.value[0].datasetId = datasetId;
        }
      });
    }
  });
  // console.log('modules->', modules);
  // 创建模型
  const appId = await mongoSessionRun(async (session) => {
    const [{ _id: appId }] = await MongoApp.create(
      [
        {
          avatar,
          name,
          teamId,
          tmbId,
          modules,
          edges,
          type,
          version: 'v2'
        }
      ],
      { session }
    );

    await MongoAppVersion.create(
      [
        {
          appId,
          nodes: modules,
          edges
        }
      ],
      { session }
    );
    return appId;
  });
  return appId;
}
