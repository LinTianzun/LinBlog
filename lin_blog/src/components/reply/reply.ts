import type { ReplyDat } from '../../utils/interface'

export type CommentProps = {
    pageSize: number;
}

export type ReplyProps = {
    content: ReplyDat;
    isComment: boolean;

}

export type InformationProps = {
    active: boolean;
    pageSize?: number;
}
