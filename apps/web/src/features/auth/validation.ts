import isEmail from "validator/lib/isEmail";
import isLength from "validator/lib/isLength";
export type Fields = {
  email?: string;
  password?: string;
  displayName?: string;
  confirmPassword?: string;
};
export function validateName(value: string) {
  return isLength(value.trim(), { min: 1, max: 100 })
    ? undefined
    : "Tên hiển thị cần từ 1 đến 100 ký tự.";
}
export function validatePassword(value: string) {
  return isLength(value, { min: 12, max: 128 })
    ? undefined
    : "Mật khẩu cần từ 12 đến 128 ký tự.";
}
export function validateCredentials(
  email: string,
  password: string,
  displayName?: string,
): Fields {
  const errors: Fields = {};
  if (
    !isEmail(email.trim().toLowerCase()) ||
    !isLength(email.trim(), { max: 254 })
  )
    errors.email = "Vui lòng nhập email hợp lệ, tối đa 254 ký tự.";
  errors.password = validatePassword(password);
  if (displayName !== undefined) errors.displayName = validateName(displayName);
  return errors;
}
// Confirmation is a client-only check: the backend RegisterDto has no confirmPassword field.
export function validateConfirmPassword(password: string, confirm: string) {
  return password === confirm ? undefined : "Mật khẩu xác nhận không khớp.";
}
