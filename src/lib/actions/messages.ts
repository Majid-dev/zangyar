import "server-only";

/**
 * Maps domain error messages to user-facing Persian feedback.
 *
 * Domain services throw plain `Error`s with stable English messages. Translating
 * them here keeps the domain layer free of presentation concerns and guarantees
 * that an unmapped failure is reported generically rather than leaking internal
 * detail to the operator.
 */

const DOMAIN_MESSAGES: Record<string, string> = {
  "A record with these unique values already exists.": "رکوردی با این مقادیر تکراری از قبل وجود دارد.",
  "Academic year end date must be after its start date.": "تاریخ پایان سال تحصیلی باید بعد از تاریخ شروع باشد.",
  "Academic year is not available for classrooms.": "سال تحصیلی انتخاب‌شده برای ساخت کلاس در دسترس نیست.",
  "Academic year not found.": "سال تحصیلی پیدا نشد.",
  "Academic year status changed concurrently.": "وضعیت این سال تحصیلی همزمان تغییر کرده است. صفحه را دوباره بارگذاری کنید.",
  "Active enrollment not found.": "ثبت‌نام فعالی برای این دانش‌آموز پیدا نشد.",
  "Archived guardians cannot be linked.": "ولی بایگانی‌شده را نمی‌توان به دانش‌آموز متصل کرد.",
  "Attendance includes a student outside the effective classroom roster.": "فهرست حضور شامل دانش‌آموزی خارج از ترکیب مؤثر کلاس است.",
  "Attendance session could not be created.": "ایجاد جلسه‌ی حضور و غیاب انجام نشد.",
  "Attendance student is not in the effective roster.": "دانش‌آموز انتخاب‌شده در ترکیب مؤثر این کلاس نیست.",
  "Classroom is not available for teacher assignment.": "کلاس انتخاب‌شده برای تخصیص دبیر در دسترس نیست.",
  "Classroom is not available in this academic year.": "این کلاس در سال تحصیلی انتخاب‌شده در دسترس نیست.",
  "Classroom is not available.": "کلاس انتخاب‌شده در دسترس نیست.",
  "Enrollment dates must fit within the academic year.": "تاریخ‌های ثبت‌نام باید داخل بازه‌ی سال تحصیلی باشد.",
  "Enrollment dates overlap an existing enrollment.": "این بازه با یک ثبت‌نام قبلی هم‌پوشانی دارد.",
  "Enrollment end date must be after its start date.": "تاریخ پایان ثبت‌نام باید بعد از تاریخ شروع آن باشد.",
  "Grade is not available for classrooms.": "پایه‌ی انتخاب‌شده برای ساخت کلاس در دسترس نیست.",
  "Grade not found.": "پایه پیدا نشد.",
  "Guardian mobile must be a valid Iranian mobile number.": "شماره همراه ولی باید یک شماره‌ی همراه معتبر ایران باشد.",
  "Guardian not found.": "ولی پیدا نشد.",
  "Guardian relationship not found.": "ارتباط ولی و دانش‌آموز پیدا نشد.",
  "National ID must contain 10 digits.": "کد ملی باید ۱۰ رقم باشد.",
  "Only an active academic year is available for enrollment.": "برای ثبت‌نام، فقط سال تحصیلی فعال در دسترس است.",
  "School is not operational.": "مدرسه در وضعیت عملیاتی نیست.",
  "School membership not found.": "عضویت مدرسه پیدا نشد.",
  "School not found.": "مدرسه پیدا نشد.",
  "Selected classroom is not available for this account.": "کلاس انتخاب‌شده برای این حساب در دسترس نیست.",
  "SMS recipients require a guardian mobile.": "برای دریافت پیامک، ثبت شماره همراه ولی لازم است.",
  "Student is not available for enrollment.": "دانش‌آموز انتخاب‌شده برای ثبت‌نام در دسترس نیست.",
  "Student not found.": "دانش‌آموز پیدا نشد.",
  "Student or guardian not found.": "دانش‌آموز یا ولی پیدا نشد.",
  "Subject not found.": "درس پیدا نشد.",
  "Teacher assignment dates must fit within the academic year.": "تاریخ‌های تخصیص دبیر باید داخل بازه‌ی سال تحصیلی باشد.",
  "Teacher is already assigned to this classroom and subject.": "این دبیر قبلاً به همین کلاس و درس تخصیص یافته است.",
  "Teacher is not assigned to this classroom for this date.": "این دبیر برای تاریخ انتخاب‌شده به کلاس تخصیص نیافته است.",
  "Teacher is not assigned to this classroom.": "این دبیر به این کلاس تخصیص نیافته است.",
  "Teacher membership not found.": "عضویت دبیر پیدا نشد.",
  "Teachers can only submit attendance for today.": "دبیران فقط می‌توانند حضور و غیاب امروز را ثبت کنند.",
  "Transfer must start after the previous enrollment.": "شروع انتقال باید بعد از ثبت‌نام قبلی باشد.",
  "User not found.": "کاربر پیدا نشد.",
  "A School Admin cannot change their own membership status.": "مدیر مدرسه نمی‌تواند وضعیت عضویت خود را تغییر دهد.",
  "A teacher with this mobile number already belongs to this school.": "دبیری با این شماره همراه از قبل در این مدرسه ثبت شده است.",
  "A code was sent recently. Try again in": "کد تأیید به‌تازگی ارسال شده است. کمی بعد دوباره تلاش کنید.",
  "No OTP provider is configured, so codes cannot be issued.": "سامانه‌ی ارسال کد تأیید در دسترس نیست.",
  "OTP_PROVIDER=development is refused in production: it issues a fixed, publicly known code.": "این تنظیم در محیط عملیاتی مجاز نیست.",
  "OTP_PROVIDER=sms is reserved but no SMS provider is implemented yet.": "ارسال پیامک هنوز راه‌اندازی نشده است.",
  "The mobile number is not a valid Iranian mobile number.": "شماره همراه واردشده معتبر نیست.",
  "The verification code could not be sent.": "ارسال کد تأیید انجام نشد. لطفاً دوباره تلاش کنید.",
  "The verification code is invalid or has expired.": "کد تأیید نامعتبر است یا منقضی شده است.",
  "This code is invalid or has expired.": "کد تأیید نامعتبر است یا منقضی شده است.",
  "Too many codes were requested for this number. Try again later.": "تعداد درخواست کد برای این شماره زیاد بوده است. کمی بعد دوباره تلاش کنید.",
  "An activated teacher cannot be invited again.": "این دبیر حساب خود را فعال کرده و نمی‌توان دوباره برای او دعوت فرستاد.",
  "Personnel code is already in use at this school.": "این کد پرسنلی در این مدرسه قبلاً استفاده شده است.",
  "School membership is not active.": "عضویت این کاربر در مدرسه فعال نیست.",
  "The teacher name cannot be empty.": "نام دبیر نمی‌تواند خالی باشد.",
  "There is no pending invitation for this teacher.": "دعوت در انتظاری برای این دبیر وجود ندارد.",
  "This activation link is invalid or has expired.": "این پیوند فعال‌سازی معتبر نیست یا منقضی شده است.",
  "This mobile number belongs to an account that cannot be activated.": "این شماره همراه به حسابی تعلق دارد که قابل فعال‌سازی نیست.",
  "This mobile number belongs to an account with a different role at this school.": "این شماره همراه به حسابی با نقش دیگری در این مدرسه تعلق دارد.",
  "This teacher account is already activated.": "حساب این دبیر قبلاً فعال شده است.",
  "Teacher not found.": "دبیر پیدا نشد.",
  "Teacher profile not found.": "پرونده‌ی دبیر پیدا نشد.",
  "Training or configuration data is invalid.": "اطلاعات واردشده معتبر نیست.",
};

const TRUNCATION = 300;

function transitionMessage(raw: string) {
  if (raw.startsWith("Invalid academic year transition")) return "این تغییر وضعیت برای سال تحصیلی مجاز نیست.";
  if (raw.startsWith("Invalid school status transition")) return "این تغییر وضعیت برای مدرسه مجاز نیست.";
  return null;
}

/**
 * OTP refusals that carry a retry hint, so the operator learns how long to wait.
 * These embed a computed number, so they are matched by prefix rather than exactly.
 */
function otpThrottleMessage(raw: string) {
  if (raw.startsWith("A code was sent recently.")) return "کد تأیید به‌تازگی ارسال شده است. کمی بعد دوباره تلاش کنید.";
  if (raw.startsWith("Too many codes were requested")) return "تعداد درخواست کد برای این شماره زیاد بوده است. کمی بعد دوباره تلاش کنید.";
  return null;
}

/**
 * Returns a safe Persian message. Unknown failures deliberately collapse to a
 * generic sentence; the original is logged server-side by the caller.
 */
export function toUserMessage(error: unknown): { message: string; known: boolean } {
  if (!(error instanceof Error)) return { message: "خطای غیرمنتظره در انجام عملیات رخ داد.", known: false };

  const exact = DOMAIN_MESSAGES[error.message];
  if (exact) return { message: exact, known: true };

  const transition = transitionMessage(error.message);
  if (transition) return { message: transition, known: true };

  const throttle = otpThrottleMessage(error.message);
  if (throttle) return { message: throttle, known: true };

  return { message: "انجام این عملیات ممکن نشد. لطفاً دوباره تلاش کنید.", known: false };
}

export function safeLogMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, TRUNCATION);
  return String(error).slice(0, TRUNCATION);
}
