import type { ChatItemType, ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

export async function getChatItems({
  appId,
  chatId,
  limit = 30,
  field,
  lessThanId // 新增参数，用于限制 _id 小于某个值
}: {
  appId: string;
  chatId?: string;
  limit?: number;
  field: string;
  lessThanId?: string; // 假设 lessThanId 可以是任何类型
}): Promise<{ history: ChatItemType[] }> {
  if (!chatId) {
    return { history: [] };
  }
  // 构建查询条件
  const query: { appId: string; chatId: string; _id?: any } = { appId, chatId };
  // 如果 lessThanId 存在，添加到查询条件中
  if (lessThanId !== undefined) {
    query._id = { $lt: lessThanId };
  }

  const history = await MongoChatItem.find(query, field)
    // const history = await MongoChatItem.find({ appId, chatId }, field)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();

  history.reverse();

  history.forEach((item) => {
    // @ts-ignore
    item.value = adaptStringValue(item.value);
  });

  return { history };
}
/* 临时适配旧的对话记录 */
export const adaptStringValue = (value: any): ChatItemValueItemType[] => {
  if (typeof value === 'string') {
    return [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: value
        }
      }
    ];
  }
  return value;
};

export const addCustomFeedbacks = async ({
  appId,
  chatId,
  chatItemId,
  feedbacks
}: {
  appId: string;
  chatId?: string;
  chatItemId?: string;
  feedbacks: string[];
}) => {
  if (!chatId || !chatItemId) return;

  try {
    await MongoChatItem.findOneAndUpdate(
      {
        appId,
        chatId,
        dataId: chatItemId
      },
      {
        $push: { customFeedbacks: { $each: feedbacks } }
      }
    );
  } catch (error) {
    addLog.error('addCustomFeedbacks error', error);
  }
};
