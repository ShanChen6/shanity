import { describe, expect, it } from 'vitest';
import { CommentRules, DEFAULT_ALLOWED_HOSTS } from './comment-rules.js';

const rules = new CommentRules({
  allowedHosts: [...DEFAULT_ALLOWED_HOSTS, 'shanity.vn'],
  blockedTerms: ['từ cấm riêng'],
});
const rule = (text: string) => rules.check(text)?.rule ?? null;

describe('layer 1: comment rules', () => {
  it('passes ordinary technical comments, Vietnamese and code included', () => {
    for (const text of [
      'Bài viết rất hay, cảm ơn tác giả!',
      'Các bạn cho mình hỏi: Node.js với socket.io dùng chung được không?',
      'Mình sửa next.config.ts rồi mà vẫn lỗi, ai biết không ạ?',
      'Tham khảo https://developer.mozilla.org/vi/docs/Web nhé',
      'Code ở github.com/vercel/next.js đó bạn',
      'Xem lại bài https://shanity.vn/blog/dao-ham',
      'Đạo hàm của x^2 là 2x, còn tích phân thì 1/3 x^3',
      'Năm 2024 mình học được 120 bài',
    ])
      expect(rule(text), text).toBeNull();
  });

  it('rejects foreign and shortened links', () => {
    for (const text of [
      'Tài liệu ôn thi giá rẻ tại https://taileu-re.xyz',
      'vào www.casino-online.com nhận quà',
      'xem ngay abc-giamgia.shop/khuyen-mai',
      'link: bit.ly/abc123',
      'https://bit.ly/abc123',
    ])
      expect(rule(text), text).toBe('SPAM_LINK');
  });

  it('rejects phone numbers and chat handles', () => {
    for (const text of [
      'Inbox mình 0912 345 678 nhé',
      'liên hệ +84.912.345.678',
      'zalo: 0912345678',
      'tele @hocgioi_vn',
      'nhóm học t.me/hocgioi',
      'https://zalo.me/g/abcxyz',
    ])
      expect(rule(text), text).toBe('CONTACT_INFO');
  });

  it('rejects profanity, also lightly disguised', () => {
    for (const text of [
      'bài viết như lồn',
      'đ.ị.t mẹ',
      'vcl hay thế',
      'ĐM tác giả',
      'what the fuck',
      'f*u*c*k this',
    ])
      expect(rule(text), text).toBe('PROFANITY');
  });

  it('does not see profanity inside innocent words or without diacritics', () => {
    for (const text of [
      'Các bạn làm bài tập chưa?',
      'Lon nước ngọt trong ví dụ', // "lon" (can), not the obscenity
      'Shitake là một loại nấm', // contains "shit" but is one word
      'Dmitri Mendeleev lập bảng tuần hoàn',
    ])
      expect(rule(text), text).toBeNull();
  });

  it('rejects operator-blocked terms and repetitive spam', () => {
    expect(rule('Đây là Từ Cấm Riêng nhé')).toBe('BLOCKED_TERM');
    expect(rule('hayyyyyyyyyyyyy quá')).toBe('REPEATED_TEXT');
    expect(rule('mua đi mua đi mua đi mua đi mua đi mua đi mua đi')).toBeNull();
    expect(rule('rẻ rẻ rẻ rẻ rẻ rẻ rẻ')).toBe('REPEATED_TEXT');
  });
});
