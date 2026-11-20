# راهنمای کامپوننت‌ها

## لایه‌ها

- `src/components/layout`: shell، sidebar، header و page header.
- `src/components/ui`: Button، Badge، Field، Panel و status badge.
- `src/components/dashboard`: قطعات مخصوص نمای مدیر.
- `src/features/*/components`: workflowهای متعلق به دامنه، مانند attendance و students.

## قراردادها

کامپوننت‌ها باید semantic HTML، focus قابل‌مشاهده، label معتبر و حالت disabled داشته باشند. رنگ‌ها از توکن‌های CSS بیایند. جزئیات دامنه در `features` بماند؛ کامپوننت‌های UI نباید به DB یا authorization دسترسی داشته باشند.

## الگوی پنل

`Panel` سطح اصلی برای گروهی از اطلاعات مرتبط است. برای متن، جدول یا فرم‌های مستقل از پنل بیش از حد استفاده نشود. `SectionHeading` تیتر و توضیح را از layout جدا می‌کند.

## فرم و دکمه

`Field`, `Input`, `Select`, `Textarea` کنترل‌های حداقل ۴۴ پیکسل دارند. `Button` چهار variant معنایی دارد و focus/disabled را پیاده می‌کند. mutation واقعی باید بعداً از Server Action تایپ‌شده استفاده کند.
