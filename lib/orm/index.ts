import dayjs from 'dayjs';
import * as php from 'php-serialize';
import { DataSource } from 'typeorm';
import * as typeorm from 'typeorm';

import type { TopicDisplay } from '@app/lib/auth/rule';
import { MYSQL_DB, MYSQL_HOST, MYSQL_PASS, MYSQL_PORT, MYSQL_USER } from '@app/lib/config';
import { UnexpectedNotFoundError, UnimplementedError } from '@app/lib/error';
import { logger } from '@app/lib/logger';
import type { ReplyState } from '@app/lib/topic';

import {
  OauthAccessTokens,
  WebSessions,
  Notify,
  NotifyField,
  Friends,
  User,
  UserField,
  UserGroup,
  GroupMembers,
  Group,
  Episode,
  Subject,
  SubjectFields,
  GroupTopic,
  GroupPost,
  SubjectRev,
} from './entity';
import * as entity from './entity';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: MYSQL_HOST,
  port: Number.parseInt(MYSQL_PORT),
  username: MYSQL_USER,
  password: MYSQL_PASS,
  database: MYSQL_DB,
  synchronize: false,
  maxQueryExecutionTime: 2000,
  logger: {
    log(level: 'log' | 'info' | 'warn', message: unknown) {
      if (level === 'info') {
        logger.info(message);
      } else if (level === 'warn') {
        logger.warn(message);
      } else {
        logger.info({ log_level: level }, message?.toString());
      }
    },

    logQuerySlow(time: number, query: string, parameters?: unknown[]) {
      logger.warn({ time, query, parameters }, 'slow sql');
    },
    logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
      logger.error({ error, query, parameters }, 'query error');
    },

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logQuery() {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logSchemaBuild() {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logMigration() {},
  },
  entities: [
    User,
    UserField,
    OauthAccessTokens,
    WebSessions,
    UserGroup,
    Notify,
    NotifyField,
    Friends,
    Group,
    GroupMembers,
    Episode,
    Subject,
    SubjectFields,
    GroupTopic,
    GroupPost,
    SubjectRev,
  ],
});

export const UserRepo = AppDataSource.getRepository(User);
export const UserFieldRepo = AppDataSource.getRepository(UserField);
export const FriendRepo = AppDataSource.getRepository(Friends);

export const SubjectRepo = AppDataSource.getRepository(Subject);
export const SubjectFieldsRepo = AppDataSource.getRepository(SubjectFields);
export const EpisodeRepo = AppDataSource.getRepository(Episode);

export const SubjectRevRepo = AppDataSource.getRepository(SubjectRev);

export const AccessTokenRepo = AppDataSource.getRepository(OauthAccessTokens);
export const SessionRepo = AppDataSource.getRepository(WebSessions);
export const UserGroupRepo = AppDataSource.getRepository(UserGroup);

export const NotifyRepo = AppDataSource.getRepository(Notify);
export const NotifyFieldRepo = AppDataSource.getRepository(NotifyField);

export const GroupRepo = AppDataSource.getRepository(Group);
export const GroupTopicRepo = AppDataSource.getRepository(GroupTopic);
export const GroupPostRepo = AppDataSource.getRepository(GroupPost);
export const GroupMemberRepo = AppDataSource.getRepository(GroupMembers);

export const repo = {
  UserField: UserFieldRepo,
  Friend: FriendRepo,
  Subject: SubjectRepo,
  SubjectFields: SubjectFieldsRepo,
  Episode: EpisodeRepo,
  AccessToken: AccessTokenRepo,
  Session: SessionRepo,
  UserGroup: UserGroupRepo,
  Notify: NotifyRepo,
  NotifyField: NotifyFieldRepo,
  Group: GroupRepo,
  GroupMember: GroupMemberRepo,
} as const;

export interface Page {
  limit?: number;
  offset?: number;
}

export interface IUser {
  id: number;
  username: string;
  nickname: string;
  groupID: number;
  img: string;
  regTime: number;
  sign: string;
}

export async function fetchUserByUsername(username: string): Promise<IUser | null> {
  const user = await UserRepo.findOne({
    where: { username },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    img: user.avatar,
    groupID: user.groupid,
    regTime: user.regdate,
    sign: user.sign,
  };
}

export async function fetchUser(userID: number): Promise<IUser | null> {
  if (!userID) {
    throw new Error(`undefined user id ${userID}`);
  }
  const user = await UserRepo.findOne({
    where: { id: userID },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    img: user.avatar,
    groupID: user.groupid,
    regTime: user.regdate,
    sign: user.sign,
  };
}

export interface Permission {
  app_erase?: boolean;
  ban_post?: boolean;
  ban_visit?: boolean;
  doujin_subject_erase?: boolean;
  doujin_subject_lock?: boolean;
  ep_edit?: boolean;
  ep_erase?: boolean;
  ep_lock?: boolean;
  ep_merge?: boolean;
  ep_move?: boolean;
  manage_app?: boolean;
  manage_report?: boolean;
  manage_topic_state?: boolean;
  manage_user?: boolean;
  manage_user_group?: boolean;
  manage_user_photo?: boolean;
  mono_edit?: boolean;
  mono_erase?: boolean;
  mono_lock?: boolean;
  mono_merge?: boolean;
  report?: boolean;
  subject_cover_erase?: boolean;
  subject_cover_lock?: boolean;
  subject_edit?: boolean;
  subject_erase?: boolean;
  subject_lock?: boolean;
  subject_merge?: boolean;
  subject_refresh?: boolean;
  subject_related?: boolean;
  user_ban?: boolean;
  user_group?: boolean;
  user_list?: boolean;
  user_wiki_apply?: boolean;
  user_wiki_approve?: boolean;
}

export async function fetchPermission(userGroup: number): Promise<Readonly<Permission>> {
  const permission = await UserGroupRepo.findOne({ where: { id: userGroup } });
  if (!permission) {
    logger.warn("can't find permission for userGroup %d", userGroup);
    return {};
  }

  if (!permission.Permission) {
    return {};
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(
        php.unserialize(permission.Permission) as Record<keyof Permission, string>,
      ).map(([key, value]) => [key, value === '1']),
    ),
  );
}

export async function addCreator<T extends { creatorID: number }>(
  arr: T[],
): Promise<(T & { creator: IUser })[]> {
  const users = await fetchUsers(arr.map((x) => x.creatorID));

  return arr.map((o) => {
    const user = users[o.creatorID];
    if (!user) {
      throw new UnexpectedNotFoundError(`user ${o.creatorID}`);
    }

    return { ...o, creator: user };
  });
}

export async function fetchUsers(userIDs: number[]): Promise<Record<number, IUser>> {
  if (userIDs.length === 0) {
    return {};
  }

  const users = await UserRepo.find({
    where: { id: typeorm.In(userIDs) },
  });

  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        nickname: user.nickname,
        username: user.username,
        img: user.avatar,
        groupID: user.groupid,
        regTime: user.regdate,
        sign: user.sign,
        user_group: user.groupid,
      },
    ]),
  );
}

export interface ITopic {
  id: number;
  parentID: number;
  creatorID: number;
  updatedAt: number;
  createdAt: number;
  title: string;
  repliesCount: number;
}

export async function fetchTopicList(
  type: 'group' | 'subject',
  id: number,
  { limit = 30, offset = 0 }: Page,
  { display }: { display: TopicDisplay[] },
): Promise<[number, ITopic[]]> {
  if (type !== 'group') {
    throw new UnimplementedError(`topic type ${type}`);
  }

  const where = {
    gid: id,
    display: typeorm.In(display),
  } as const;

  const total = await GroupTopicRepo.count({ where });
  const topics = await GroupTopicRepo.find({
    where,
    order: { dateline: 'desc' },
    skip: offset,
    take: limit,
  });

  return [
    total,
    topics.map((x) => {
      return {
        id: x.id,
        parentID: x.gid,
        creatorID: x.uid,
        title: x.title,
        createdAt: x.dateline,
        updatedAt: x.lastpost,
        repliesCount: x.replies,
      };
    }),
  ];
}

export async function fetchSubject(id: number) {
  const subject = await SubjectRepo.findOne({
    where: { id },
  });

  if (!subject) {
    return null;
  }

  const f = await SubjectFieldsRepo.findOne({
    where: { subject_id: id },
  });

  if (!f) {
    throw new UnexpectedNotFoundError(`subject fields ${id}`);
  }

  return {
    id: subject.id,
    name: subject.name,
    typeID: subject.typeID,
    infobox: subject.fieldInfobox,
    platform: subject.platform,
    summary: subject.fieldSummary,
    nsfw: subject.subjectNsfw,
    date: f.date,
    redirect: f.fieldRedirect,
    locked: subject.locked(),
  };
}

interface IGroup {
  id: number;
  name: string;
  nsfw: boolean;
  description: string;
  title: string;
  createdAt: number;
  totalMembers: number;
  icon: string;
  accessible: boolean;
}

export async function fetchGroupByID(id: number): Promise<IGroup | null> {
  const group = await GroupRepo.findOne({
    where: { id },
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    title: group.title,
    nsfw: group.nsfw,
    description: group.description,
    createdAt: group.builddate,
    icon: group.icon,
    totalMembers: group.memberCount,
    accessible: group.accessible,
  } satisfies IGroup;
}

export async function fetchGroup(name: string): Promise<IGroup | null> {
  const group = await GroupRepo.findOne({
    where: { name },
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    title: group.title,
    nsfw: group.nsfw,
    description: group.description,
    icon: group.icon,
    createdAt: group.builddate,
    totalMembers: group.memberCount,
    accessible: group.accessible,
  } satisfies IGroup;
}

export interface IBaseReply {
  id: number;
  text: string;
  creatorID: number;
  state: number;
  createdAt: number;
  repliedTo: number;
}

export type ISubReply = IBaseReply;

export interface IReply extends IBaseReply {
  replies: ISubReply[];
}

interface ITopicDetails {
  id: number;
  title: string;
  text: string;
  state: number;
  createdAt: number;
  creatorID: number;
  // group ID or subject ID
  parentID: number;
  replies: IReply[];
}

export async function fetchTopicDetails(type: 'group', id: number): Promise<ITopicDetails | null> {
  const topic = await GroupTopicRepo.findOne({
    where: { id: id },
  });

  if (!topic) {
    return null;
  }

  const replies = await GroupPostRepo.find({
    where: {
      topicID: topic.id,
    },
  });

  const top = replies.shift();
  if (!top) {
    throw new UnexpectedNotFoundError(`top reply of topic(${type}) ${id}`);
  }

  const subReplies: Record<number, ISubReply[]> = {};

  for (const x of replies.filter((x) => x.related !== 0)) {
    const sub: ISubReply = {
      id: x.id,
      repliedTo: x.related,
      creatorID: x.uid,
      text: x.content,
      state: x.state,
      createdAt: x.dateline,
    };

    subReplies[x.related] ??= [];
    subReplies[x.related]?.push(sub);
  }

  const topLevelReplies = replies
    .filter((x) => x.related === 0)
    .map(function (x): IReply {
      return {
        id: x.id,
        replies: subReplies[x.id] ?? ([] as ISubReply[]),
        creatorID: x.uid,
        text: x.content,
        state: x.state,
        createdAt: x.dateline,
        repliedTo: x.related,
      };
    });

  return {
    id: topic.id,
    title: topic.title,
    parentID: topic.gid,
    text: top.content,
    state: topic.state,
    replies: topLevelReplies,
    creatorID: top.uid,
    createdAt: top.dateline,
  } satisfies ITopicDetails;
}

export async function fetchFriends(id?: number): Promise<Record<number, boolean>> {
  if (!id) {
    return {};
  }

  const friends = await FriendRepo.find({
    where: { frdUid: id },
  });

  return Object.fromEntries(friends.map((x) => [x.frdFid, true]));
}

/** Is user(another) is friend of user(userID) */
export async function isFriends(userID: number, another: number): Promise<boolean> {
  const friends = await FriendRepo.count({
    where: { frdUid: userID, frdFid: another },
  });

  return friends !== 0;
}

interface PostCreation {
  title: string;
  content: string;
  groupID: number;
  userID: number;
  display: TopicDisplay;
  state: ReplyState;
}

export async function createPostInGroup(post: PostCreation): Promise<{ id: number }> {
  const now = dayjs();

  return await AppDataSource.transaction(async (t) => {
    const GroupTopicRepo = t.getRepository(entity.GroupTopic);
    const GroupPostRepo = t.getRepository(entity.GroupPost);

    const topic = await GroupTopicRepo.save({
      title: post.title,
      gid: post.groupID,
      uid: post.userID,
      state: post.state,
      lastpost: now.unix(),
      dateline: now.unix(),
      replies: 0,
      display: post.display,
    });

    await GroupPostRepo.insert({
      topicID: topic.id,
      dateline: now.unix(),
      state: post.state,
      uid: post.userID,
      content: post.content,
      related: 0,
    });

    return { id: topic.id };
  });
}

export async function isMemberInGroup(gid: number, uid: number): Promise<boolean> {
  const inGroup = await GroupMemberRepo.count({
    where: { gmbGid: gid, gmbUid: uid },
  });

  return Boolean(inGroup);
}

export async function fetchUserX(id: number): Promise<IUser> {
  const u = await fetchUser(id);
  if (!u) {
    throw new UnexpectedNotFoundError(`user ${id}`);
  }

  return u;
}
