import { TeamTmbItemType, TeamMemberWithTeamSchema } from '@fastgpt/global/support/user/team/type';
import { ClientSession, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  notLeaveStatus
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { getResourcePermission } from '../../permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { MongoUser } from '../schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { PRICE_SCALE } from '@fastgpt/global/support/wallet/constants';

async function getTeamMember(match: Record<string, any>): Promise<TeamTmbItemType> {
  const tmb = (await MongoTeamMember.findOne(match).populate('teamId')) as TeamMemberWithTeamSchema;
  if (!tmb) {
    return Promise.reject('member not exist');
  }

  const tmbPer = await getResourcePermission({
    resourceType: PerResourceTypeEnum.team,
    teamId: tmb.teamId._id,
    tmbId: tmb._id
  });

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId._id),
    teamName: tmb.teamId.name,
    memberName: tmb.name,
    avatar: tmb.teamId.avatar,
    balance: tmb.teamId.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.teamId?.teamDomain,
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    lafAccount: tmb.teamId.lafAccount,
    permission: new TeamPermission({
      per: tmbPer?.permission ?? tmb.teamId.defaultPermission,
      isOwner: tmb.role === TeamMemberRoleEnum.owner
    })
  };
}

export async function getTmbInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    _id: new Types.ObjectId(String(tmbId)),
    status: notLeaveStatus
  });
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });
}
export async function createDefaultTeam({
  userId,
  teamName,
  avatar = '/icon/logo.svg',
  balance,
  session
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  balance?: number;
  session: ClientSession;
}) {
  // auth default team
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });

  if (!tmb) {
    // create
    const [{ _id: insertedId }] = await MongoTeam.create(
      [
        {
          ownerId: userId,
          name: teamName,
          avatar,
          balance,
          createTime: new Date()
        }
      ],
      { session }
    );
    await MongoTeamMember.create(
      [
        {
          teamId: insertedId,
          userId,
          name: 'Owner',
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date(),
          defaultTeam: true
        }
      ],
      { session }
    );
    console.log('create default team', userId);
  } else {
    console.log('default team exist', userId);
    await MongoTeam.findByIdAndUpdate(tmb.teamId, {
      $set: {
        ...(balance !== undefined && { balance })
      }
    });
  }
}

export async function createUserTeam({
  userId,
  teamName,
  avatar = '/icon/logo.svg',
  balance,
  session
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  balance?: number;
  session: ClientSession;
}) {
  // auth default team
  const tmb = await MongoTeam.findOne({
    name: teamName
  });

  if (!tmb) {
    // create
    await initRootUser();
    console.log('create default team', userId);
  } else {
    console.log('default team exist', userId);
    const tm = await MongoTeamMember.findOne({
      userId: new Types.ObjectId(userId),
      defaultTeam: true
    });
    if (!tm) {
      await MongoTeamMember.create(
        [
          {
            teamId: tmb._id,
            userId,
            name: 'admin',
            role: TeamMemberRoleEnum.admin,
            status: TeamMemberStatusEnum.active,
            createTime: new Date(),
            defaultTeam: true
          }
        ],
        { session }
      );
    }
  }
}

async function initRootUser(retry = 3): Promise<any> {
  try {
    const rootUser = await MongoUser.findOne({
      username: 'root'
    });
    const psw = process.env.DEFAULT_ROOT_PSW || '123456';

    let rootId = rootUser?._id || '';

    await mongoSessionRun(async (session) => {
      // init root user
      if (rootUser) {
        await rootUser.updateOne({
          password: hashStr(psw)
        });
      } else {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: 'root',
              password: hashStr(psw)
            }
          ],
          { session }
        );
        rootId = _id;
      }
      // init root team
      await createDefaultTeam({
        userId: rootId,
        teamName: 'root',
        balance: 9999 * PRICE_SCALE,
        session
      });
    });

    console.log(`root user init:`, {
      username: 'root',
      password: psw
    });
  } catch (error) {
    if (retry > 0) {
      console.log('retry init root user');
      return initRootUser(retry - 1);
    } else {
      console.error('init root user error', error);
    }
  }
}
export async function updateTeam({
  teamId,
  name,
  avatar,
  teamDomain,
  lafAccount
}: UpdateTeamProps & { teamId: string }) {
  await MongoTeam.findByIdAndUpdate(teamId, {
    name,
    avatar,
    teamDomain,
    lafAccount
  });
}
