import { CollectionWithDatasetType, DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';
import { createDefaultCollection, delCollectionRelatedSource } from './collection/controller';
import { ClientSession } from '../../common/mongo';
import { MongoDatasetTraining } from './training/schema';
import { MongoDatasetData } from './data/schema';
import { deleteDatasetDataVector } from '../../common/vectorStore/controller';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getDatasetModel, getLLMModel, getVectorModel } from '../ai/model';
import console from 'console';

/* ============= dataset ========== */
/* find all datasetId by top datasetId */
export async function findDatasetAndAllChildren({
  teamId,
  datasetId,
  fields
}: {
  teamId: string;
  datasetId: string;
  fields?: string;
}): Promise<DatasetSchemaType[]> {
  const find = async (id: string) => {
    const children = await MongoDataset.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let datasets = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      datasets = datasets.concat(grandChildrenIds);
    }

    return datasets;
  };
  const [dataset, childDatasets] = await Promise.all([
    MongoDataset.findById(datasetId),
    find(datasetId)
  ]);

  if (!dataset) {
    return Promise.reject('Dataset not found');
  }

  return [dataset, ...childDatasets];
}

export async function getCollectionWithDataset(collectionId: string) {
  const data = (await MongoDatasetCollection.findById(collectionId)
    .populate('datasetId')
    .lean()) as CollectionWithDatasetType;
  if (!data) {
    return Promise.reject('Collection is not exist');
  }
  return data;
}

/* delete all data by datasetIds */
export async function delDatasetRelevantData({
  datasets,
  session
}: {
  datasets: DatasetSchemaType[];
  session: ClientSession;
}) {
  if (!datasets.length) return;

  const teamId = datasets[0].teamId;

  if (!teamId) {
    return Promise.reject('teamId is required');
  }

  const datasetIds = datasets.map((item) => String(item._id));

  // Get _id, teamId, fileId, metadata.relatedImgId for all collections
  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds }
    },
    '_id teamId datasetId fileId metadata'
  ).lean();

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

  // image and file
  await delCollectionRelatedSource({ collections, session });

  // delete dataset.datas
  await MongoDatasetData.deleteMany({ teamId, datasetId: { $in: datasetIds } }, { session });

  // delete collections
  await MongoDatasetCollection.deleteMany(
    {
      teamId,
      datasetId: { $in: datasetIds }
    },
    { session }
  );

  // no session delete: delete files, vector data
  await deleteDatasetDataVector({ teamId, datasetIds });
}

export async function findDatasetOrCreate({
  parentId,
  name,
  type = DatasetTypeEnum.dataset,
  avatar,
  vectorModel = global.vectorModels[0].model,
  agentModel = getDatasetModel().model,
  teamId,
  tmbId
}: {
  parentId?: string;
  type: `${DatasetTypeEnum}`;
  name: string;
  intro: string;
  avatar: string;
  vectorModel?: string;
  agentModel?: string;
  teamId: string;
  tmbId: string;
}): Promise<String> {
  const dataset = await MongoDataset.findOne({
    teamId,
    tmbId,
    name,
    type
  });

  if (dataset) {
    return dataset._id;
  }
  const { _id } = await MongoDataset.create({
    name,
    teamId,
    tmbId,
    vectorModel,
    agentModel,
    avatar,
    parentId: parentId || null,
    type
  });

  // if (type === DatasetTypeEnum.dataset) {
  //   await createDefaultCollection({
  //     datasetId: _id,
  //     teamId,
  //     tmbId
  //   });
  // }

  return _id;
}
