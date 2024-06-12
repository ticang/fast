import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  Switch,
  Textarea,
  Checkbox,
  HStack
} from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import type { ChatInputGuideConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyInput from '@/components/MyInput';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useI18n } from '@/web/context/I18n';
import { fileDownload } from '@/web/common/file/utils';
import { getDocPath } from '@/web/common/system/doc';
import {
  delChatInputGuide,
  getChatInputGuideList,
  getCountChatInputGuideTotal,
  postChatInputGuides,
  putChatInputGuide
} from '@/web/core/chat/inputGuide/api';
import { useQuery } from '@tanstack/react-query';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { readCsvRawText } from '@fastgpt/web/common/file/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { defaultChatInputGuideConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const csvTemplate = `"第一列内容"
"只会将第一列内容导入，其余列会被忽略"
"AIGC发展分为几个阶段？"`;

const InputGuideConfig = ({
  appId,
  value = defaultChatInputGuideConfig,
  onChange
}: {
  appId: string;
  value?: ChatInputGuideConfigType;
  onChange: (e: ChatInputGuideConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { chatT, commonT } = useI18n();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isOpenLexiconConfig,
    onOpen: onOpenLexiconConfig,
    onClose: onCloseLexiconConfig
  } = useDisclosure();
  const isOpenQuestionGuide = value.open;

  const { data } = useQuery(
    [appId, isOpenLexiconConfig],
    () => {
      return getCountChatInputGuideTotal({
        appId
      });
    },
    {
      enabled: !!appId
    }
  );
  const total = data?.total || 0;

  const formLabel = useMemo(() => {
    if (!isOpenQuestionGuide) {
      return t('core.app.whisper.Close');
    }
    return t('core.app.whisper.Open');
  }, [t, isOpenQuestionGuide]);

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/inputGuides'} mr={2} w={'20px'} />
      <Flex alignItems={'center'}>
        <FormLabel>{chatT('Input guide')}</FormLabel>
        <ChatFunctionTip type={'inputGuide'} />
      </Flex>
      <Box flex={1} />
      <MyTooltip label={chatT('Config input guide')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          onClick={onOpen}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        title={chatT('Input guide')}
        iconSrc="core/app/inputGuides"
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody px={[5, 16]} py={[4, 8]} w={'500px'}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel>{t('Is open')}</FormLabel>
            <Switch
              isChecked={isOpenQuestionGuide}
              onChange={(e) => {
                onChange({
                  ...value,
                  open: e.target.checked
                });
              }}
            />
          </Flex>
          {isOpenQuestionGuide && (
            <>
              <Flex mt={8} alignItems={'center'}>
                <FormLabel>{chatT('Input guide lexicon')}</FormLabel>
                <Box fontSize={'xs'} px={2} bg={'myGray.100'} ml={1} rounded={'full'}>
                  {total}
                </Box>
                <Box flex={'1 0 0'} />
                <Button
                  variant={'whiteBase'}
                  size={'sm'}
                  leftIcon={<MyIcon boxSize={'4'} name={'common/settingLight'} />}
                  onClick={() => {
                    onOpenLexiconConfig();
                  }}
                >
                  {chatT('Config input guide lexicon')}
                </Button>
              </Flex>
              <>
                <Flex mt={8} alignItems={'center'}>
                  <FormLabel>{chatT('Custom input guide url')}</FormLabel>
                  <Flex
                    onClick={() => window.open(getDocPath('/docs/course/chat_input_guide'))}
                    color={'primary.700'}
                    alignItems={'center'}
                    cursor={'pointer'}
                  >
                    <MyIcon name={'book'} ml={4} mr={1} />
                    {commonT('common.Documents')}
                  </Flex>
                  <Box flex={'1 0 0'} />
                </Flex>
                <Textarea
                  mt={2}
                  bg={'myGray.50'}
                  defaultValue={value.customUrl}
                  onBlur={(e) =>
                    onChange({
                      ...value,
                      customUrl: e.target.value
                    })
                  }
                />
              </>
            </>
          )}
        </ModalBody>
      </MyModal>

      {isOpenLexiconConfig && <LexiconConfigModal appId={appId} onClose={onCloseLexiconConfig} />}
    </Flex>
  );
};

export default React.memo(InputGuideConfig);

const LexiconConfigModal = ({ appId, onClose }: { appId: string; onClose: () => void }) => {
  const { chatT, commonT } = useI18n();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.csv'
  });
  const [newData, setNewData] = useState<string>();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editDataId, setEditDataId] = useState<string>();

  const [searchKey, setSearchKey] = useState('');

  const {
    list,
    setData,
    ScrollList,
    isLoading: isRequesting,
    fetchData,
    scroll2Top
  } = useScrollPagination(getChatInputGuideList, {
    refreshDeps: [searchKey],
    debounceWait: 300,

    itemHeight: 48,
    overscan: 20,

    pageSize: 20,
    defaultParams: {
      appId,
      searchKey
    }
  });

  const { run: createNewData, loading: isCreating } = useRequest2(
    (textList: string[]) => {
      if (textList.filter(Boolean).length === 0) {
        return Promise.resolve();
      }
      scroll2Top();
      return postChatInputGuides({
        appId,
        textList
      }).then((res) => {
        if (res.insertLength < textList.length) {
          toast({
            status: 'warning',
            title: chatT('Insert input guide, Some data already exists', { len: res.insertLength })
          });
        } else {
          toast({
            status: 'success',
            title: t('common.Add Success')
          });
        }
        fetchData(1);
      });
    },
    {
      onSuccess() {
        setNewData(undefined);
      },
      errorToast: t('error.Create failed')
    }
  );

  const onUpdateData = ({ text, dataId }: { text: string; dataId: string }) => {
    setData((state) =>
      state.map((item) => {
        if (item._id === dataId) {
          return {
            ...item,
            text
          };
        }
        return item;
      })
    );

    if (text) {
      putChatInputGuide({
        appId,
        text,
        dataId
      });
    }

    setEditDataId(undefined);
  };
  const onDeleteData = (dataIdList: string[]) => {
    setData((state) => state.filter((item) => !dataIdList.includes(item._id)));
    delChatInputGuide({
      appId,
      dataIdList
    });
  };

  const onSelectFile = async (files: File[]) => {
    const file = files?.[0];
    if (file) {
      const list = await readCsvRawText({ file });
      const textList = list.map((item) => item[0]?.trim() || '').filter(Boolean);
      createNewData(textList);
    }
  };

  const isLoading = isRequesting || isCreating;

  return (
    <MyModal
      title={chatT('Config input guide lexicon title')}
      iconSrc="core/app/inputGuides"
      isOpen={true}
      onClose={onClose}
      isLoading={isLoading}
      h={'600px'}
      w={'500px'}
    >
      <Flex gap={4} px={8} py={4} mb={4} alignItems={'center'} borderBottom={'base'}>
        <Box flex={1}>
          <MyInput
            leftIcon={<MyIcon name={'common/searchLight'} boxSize={4} color={'myGray.500'} />}
            bg={'myGray.50'}
            w={'full'}
            h={9}
            placeholder={commonT('common.Search')}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </Box>
        <Button
          onClick={onOpenSelectFile}
          variant={'whiteBase'}
          size={'sm'}
          leftIcon={<MyIcon name={'common/importLight'} boxSize={4} />}
        >
          {commonT('common.Import')}
        </Button>
        <Box
          cursor={'pointer'}
          onClick={() => {
            fileDownload({
              text: csvTemplate,
              type: 'text/csv;charset=utf-8',
              filename: 'questionGuide_template.csv'
            });
          }}
        >
          <QuestionTip ml={-2} label={chatT('Csv input lexicon tip')} />
        </Box>
      </Flex>
      <Box px={8}>
        {/* button */}
        <Flex mb={1} justifyContent={'space-between'}>
          <Box flex={1} />
          <Flex gap={4}>
            <Button
              variant={'whiteBase'}
              display={selectedRows.length === 0 ? 'none' : 'flex'}
              size={'sm'}
              leftIcon={<MyIcon name={'delete'} boxSize={4} />}
              onClick={() => {
                onDeleteData(selectedRows);
                setSelectedRows([]);
              }}
            >
              {commonT('common.Delete')}
            </Button>
            <Button
              display={selectedRows.length !== 0 ? 'none' : 'flex'}
              onClick={() => {
                setNewData('');
              }}
              size={'sm'}
              leftIcon={<MyIcon name={'common/addLight'} boxSize={4} />}
            >
              {commonT('common.Add')}
            </Button>
          </Flex>
        </Flex>
        {/* new data input */}
        {newData !== undefined && (
          <Box mt={5} ml={list.length > 0 ? 7 : 0}>
            <MyInput
              autoFocus
              rightIcon={<MyIcon name={'save'} w={'14px'} cursor={'pointer'} />}
              placeholder={chatT('New input guide lexicon')}
              onBlur={(e) => {
                createNewData([e.target.value.trim()]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createNewData([e.currentTarget.value.trim()]);
                }
              }}
            />
          </Box>
        )}
      </Box>
      <ScrollList
        px={8}
        flex={'1 0 0'}
        fontSize={'sm'}
        EmptyChildren={<EmptyTip text={chatT('Chat input guide lexicon is empty')} />}
      >
        {list.map((data, index) => {
          const item = data.data;

          const selected = selectedRows.includes(item._id);
          const edited = editDataId === item._id;

          return (
            <Flex
              key={index}
              alignItems={'center'}
              h={10}
              mt={2}
              _hover={{
                '& .icon-list': {
                  display: 'flex'
                }
              }}
            >
              <Checkbox
                mr={2}
                isChecked={selected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRows([...selectedRows, item._id]);
                  } else {
                    setSelectedRows(selectedRows.filter((id) => id !== item._id));
                  }
                }}
              />
              {edited ? (
                <Box h={'full'} flex={'1 0 0'}>
                  <MyInput
                    autoFocus
                    defaultValue={item.text}
                    rightIcon={<MyIcon name={'save'} boxSize={4} cursor={'pointer'} />}
                    onBlur={(e) => {
                      onUpdateData({
                        text: e.target.value.trim(),
                        dataId: item._id
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateData({
                          text: e.currentTarget.value.trim(),
                          dataId: item._id
                        });
                      }
                    }}
                  />
                </Box>
              ) : (
                <Flex
                  h={'40px'}
                  w={0}
                  flex={'1 0 0'}
                  rounded={'md'}
                  px={4}
                  bg={'myGray.50'}
                  alignItems={'center'}
                  border={'base'}
                  _hover={{ borderColor: 'primary.300' }}
                >
                  <Box className="textEllipsis" w={0} flex={'1 0 0'}>
                    <HighlightText rawText={item.text} matchText={searchKey} />
                  </Box>
                  {selectedRows.length === 0 && (
                    <Box className="icon-list" display={'none'}>
                      <MyIcon
                        name={'edit'}
                        boxSize={4}
                        mr={2}
                        color={'myGray.600'}
                        cursor={'pointer'}
                        onClick={() => setEditDataId(item._id)}
                      />
                      <MyIcon
                        name={'delete'}
                        boxSize={4}
                        color={'myGray.600'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.600' }}
                        onClick={() => onDeleteData([item._id])}
                      />
                    </Box>
                  )}
                </Flex>
              )}
            </Flex>
          );
        })}
      </ScrollList>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};
