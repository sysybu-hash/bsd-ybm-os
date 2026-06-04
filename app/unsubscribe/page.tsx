import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "הסרה מרשימת תפוצה — BSD-YBM",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const success = params.success === "1";
  const error = params.error;

  return (
    <main dir="rtl" className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        {success ? (
          <>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">הוסרת בהצלחה</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              לא תקבל יותר מיילים שיווקיים מאיתנו. מיילים תפעוליים (איפוס סיסמה, קבלות) ימשיכו להישלח.
            </p>
          </>
        ) : error ? (
          <>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">קישור לא תקף</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {error === "missing"
                ? "חסרים פרטים בקישור ההסרה."
                : "קישור ההסרה אינו תקף או שפג תוקפו."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">הסרה מרשימת תפוצה</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              השתמש בקישור ההסרה שנשלח אליך באימייל.
            </p>
          </>
        )}
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          חזרה לדף הבית →
        </Link>
      </div>
    </main>
  );
}
