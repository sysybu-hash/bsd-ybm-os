import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBlogPost, getAllPosts } from "@/lib/blog/blog-content";
import { buildArticleJsonLd } from "@/lib/google-publish/structured-data";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.titleHe,
    description: post.summaryHe,
    alternates: { canonical: `${getCanonicalSiteUrl()}/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.titleHe,
      description: post.summaryHe,
      url: `${getCanonicalSiteUrl()}/blog/${slug}`,
      publishedTime: post.publishedAt,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  // Convert markdown-style bold (**text**) to <strong>
  const bodyHtml = post.bodyHe
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split("\n")
    .map((line) => {
      if (line.startsWith("**") && line.endsWith("**")) return `<h3>${line.slice(2, -2)}</h3>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (line === "") return "<br />";
      return `<p>${line}</p>`;
    })
    .join("");

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
      >
        ← חזרה לבלוג
      </Link>

      <article className="prose prose-slate prose-lg max-w-none dark:prose-invert" dir="rtl">
        <header className="not-prose mb-8">
          <div className="flex flex-wrap gap-2 mb-3">
            {post.tags?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white md:text-4xl">
            {post.titleHe}
          </h1>
          <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">{post.summaryHe}</p>
          <p className="mt-2 text-sm text-slate-400">
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("he-IL", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            {post.author ? ` · ${post.author}` : ""}
          </p>
        </header>

        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildArticleJsonLd(post)),
        }}
      />

      {/* CTA */}
      <div dir="rtl" className="mt-12 rounded-2xl border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-800 dark:bg-indigo-950/40">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">
          מוכן להתחיל?
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          נסה BSD-YBM בחינם — ניהול פרויקטים, גנט, ויומן עבודה קולי.
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white hover:bg-indigo-700 transition-colors"
        >
          התחל חינם →
        </Link>
      </div>
    </main>
  );
}
