import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog/blog-content";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "בלוג BSD-YBM — טיפים לקבלנים ומנהלי פרויקטים",
  description: "מדריכים, טיפים ועדכונים לניהול פרויקטי בנייה, גנט, כתב כמויות, ו-AI בשטח.",
  alternates: {
    canonical: `${getCanonicalSiteUrl()}/blog`,
  },
  openGraph: {
    type: "website",
    title: "בלוג BSD-YBM",
    description: "מדריכים לקבלנים — ניהול פרויקטים, גנט, AI, ויומן עבודה קולי.",
    url: `${getCanonicalSiteUrl()}/blog`,
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <main dir="rtl" className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white md:text-4xl">
          בלוג BSD-YBM
        </h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
          מדריכים, טיפים ועדכונים לקבלנים ומנהלי פרויקטים
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            {post.featured ? (
              <span className="mb-3 inline-flex w-fit rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                מומלץ
              </span>
            ) : null}
            <h2 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
              {post.titleHe}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {post.summaryHe}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {post.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                >
                  {tag}
                </span>
              ))}
              <time
                className="mr-auto text-[11px] text-slate-400"
                dateTime={post.publishedAt}
              >
                {new Date(post.publishedAt).toLocaleDateString("he-IL")}
              </time>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
