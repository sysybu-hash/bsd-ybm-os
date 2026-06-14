/**
 * Copy for the redesigned landing page (construction / field focus).
 * Isolated from the live site's i18n so the existing `/` is untouched.
 * Hebrew is the authored source; en/ru mirror it.
 */

export type RedesignLocale = "he" | "en" | "ru";

export type RedesignCopy = {
  nav: { howItWorks: string; modules: string; pricing: string; contact: string; signIn: string; register: string };
  hero: {
    blessing: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trust: string;
  };
  proof: { items: { value: string; label: string }[] };
  value: {
    title: string;
    subtitle: string;
    cards: { title: string; body: string }[];
  };
  demo: { label: string; title: string; subtitle: string };
  how: { title: string; subtitle: string; steps: { title: string; body: string }[] };
  modules: { title: string; subtitle: string; items: { title: string; body: string }[] };
  industries: { title: string; subtitle: string; tags: string[] };
  pricing: {
    title: string;
    subtitle: string;
    plans: { name: string; price: string; period: string; features: string[]; cta: string; featured?: boolean }[];
    note: string;
  };
  faq: { title: string; items: { q: string; a: string }[] };
  finalCta: { title: string; subtitle: string; primary: string; secondary: string };
  footer: { tagline: string; rights: string };
};

const he: RedesignCopy = {
  nav: {
    howItWorks: "איך זה עובד",
    modules: "מודולים",
    pricing: "מחיר",
    contact: "צור קשר",
    signIn: "כניסה",
    register: "פתיחת חשבון",
  },
  hero: {
    blessing: "בסיעתא דשמיא",
    title: "כל הקבלנות שלך — במקום אחד",
    subtitle:
      "פרויקטים, לקוחות, מסמכים וכספים — מהשטח ועד המשרד. סורקים חשבונית בטלפון, וה-AI כבר מסדר, מתייק ומעדכן את הפרויקט בשבילך.",
    ctaPrimary: "פתיחת חשבון חינם",
    ctaSecondary: "צפו בהדגמה",
    trust: "מאות אנשי שטח וקבלנים כבר עובדים חכם יותר עם BSD-YBM",
  },
  proof: {
    items: [
      { value: "−8 שע׳", label: "פחות ניירת בשבוע, בממוצע" },
      { value: "1 מערכת", label: "במקום 5 אפליקציות נפרדות" },
      { value: "30 שנ׳", label: "מסריקה למסמך מסודר בפרויקט" },
    ],
  },
  value: {
    title: "נמאס לרדוף אחרי הניירת?",
    subtitle: "במקום וואטסאפ, אקסל ותיקיות — הכל זורם אוטומטית למקום אחד.",
    cards: [
      {
        title: "הכל במקום אחד",
        body: "לקוחות, פרויקטים, חשבוניות, הצעות מחיר ויומן — בלי לקפוץ בין אפליקציות ובלי דברים שנופלים בין הכיסאות.",
      },
      {
        title: "מהשטח, בלי משרד",
        body: "מצלמים מסמך או מדברים לטלפון — וה-AI ממלא, מתייק ומעדכן את הפרויקט הנכון. עובד גם עם ידיים מלאות בטון.",
      },
      {
        title: "AI שמכיר את העסק שלך",
        body: "לא צ׳אט גנרי — עוזר שיודע מי הלקוחות, מה הפרויקטים ומה הסטטוס, ומקפיץ את הצעד הבא בעצמו.",
      },
    ],
  },
  demo: {
    label: "הדגמה חיה",
    title: "נסו בעצמכם — ללא התחברות",
    subtitle: "העלו חשבונית או תמונה וראו איך Gemini Vision מפענח אותה בזמן אמת.",
  },
  how: {
    title: "מהשטח למשרד בשלושה צעדים",
    subtitle: "בלי הקלדות, בלי תיוק ידני.",
    steps: [
      { title: "1 · מצלמים או מדברים", body: "חשבונית, תעודת משלוח, יומן עבודה — צילום מהטלפון או פקודה קולית." },
      { title: "2 · ה-AI מסדר", body: "המערכת מזהה, ממלאת שדות, מתייקת לפרויקט הנכון ומעדכנת סטטוס." },
      { title: "3 · שליטה מלאה", body: "דאשבורד אחד: רווחיות פרויקט, גבייה, חשבוניות וצעדים הבאים — בזמן אמת." },
    ],
  },
  modules: {
    title: "כל מה שעסק בנייה צריך",
    subtitle: "מודולים שעובדים יחד — מפעילים מה שצריך, מתי שצריך.",
    items: [
      { title: "ניהול לקוחות (CRM)", body: "כל לקוח, ספק וקשר במקום אחד, עם היסטוריה מלאה." },
      { title: "פרויקטים", body: "לוח מרכז שליטה: משימות, לוחות זמנים ורווחיות לכל אתר." },
      { title: "מסמכים וסריקה", body: "סריקה חכמה, ארכיון, הפקת חשבוניות והצעות מחיר." },
      { title: "כספים", body: "תזרים, גבייה וחשבוניות — בלי אקסל." },
      { title: "Copilot שטח", body: "עוזר נייד לאנשי השטח: קול, צילום ועדכון מהיר." },
      { title: "AI Hub", body: "עוזר חכם שמכיר את כל הנתונים שלך ופועל בשבילך." },
    ],
  },
  industries: {
    title: "בנוי לכל ענפי הבנייה",
    subtitle: "מתאים את עצמו להתמחות שלך.",
    tags: [
      "קבלני שלד",
      "שיפוצים",
      "חשמל",
      "אינסטלציה",
      "מיזוג ואוורור",
      "ריצוף וחיפוי",
      "גמר ותשתיות",
      "קבלני משנה",
    ],
  },
  pricing: {
    title: "מחיר פשוט והוגן",
    subtitle: "מתחילים חינם. משדרגים כשגדלים.",
    plans: [
      {
        name: "התחלה",
        price: "₪0",
        period: "/ לחודש",
        features: ["משתמש אחד", "CRM ופרויקטים", "סריקת מסמכים בסיסית", "ללא כרטיס אשראי"],
        cta: "להתחלה חינם",
      },
      {
        name: "מקצועי",
        price: "₪149",
        period: "/ לחודש",
        features: ["עד 5 משתמשים", "כל המודולים", "AI Hub + Copilot שטח", "גבייה וחשבוניות", "תמיכה מועדפת"],
        cta: "התחילו עכשיו",
        featured: true,
      },
      {
        name: "ארגוני",
        price: "בהתאמה",
        period: "",
        features: ["משתמשים ללא הגבלה", "אינטגרציות מתקדמות", "ליווי והטמעה", "SLA ייעודי"],
        cta: "דברו איתנו",
      },
    ],
    note: "כל המסלולים כוללים עדכונים שוטפים ואבטחה ללא סיסמאות (Passkey).",
  },
  faq: {
    title: "שאלות נפוצות",
    items: [
      { q: "צריך להתקין משהו?", a: "לא. הכל עובד בדפדפן ובטלפון, ללא התקנה. נכנסים ומתחילים." },
      { q: "זה מתאים גם לעסק קטן / קבלן עצמאי?", a: "בהחלט. מתחילים חינם עם משתמש אחד ומשדרגים רק כשצריך." },
      { q: "איך הסריקה עובדת?", a: "מצלמים חשבונית או מסמך, וה-AI (Gemini) מזהה את הפרטים וממלא אוטומטית." },
      { q: "הנתונים שלי מאובטחים?", a: "כן. כניסה ללא סיסמאות (Passkey/Face ID) והצפנה. הנתונים שלך שלך בלבד." },
      { q: "אפשר לעבוד מהשטח בלי קליטה טובה?", a: "הממשק קל ומהיר, מותאם לטלפון ולעבודה תוך כדי תנועה." },
    ],
  },
  finalCta: {
    title: "מוכנים לעבוד חכם יותר?",
    subtitle: "פתחו חשבון בחינם ב-2 דקות — בלי כרטיס אשראי, בלי התחייבות.",
    primary: "פתיחת חשבון חינם",
    secondary: "דברו איתנו",
  },
  footer: {
    tagline: "מערכת ההפעלה העסקית לקבלנות ולשטח — בסיעתא דשמיא.",
    rights: "כל הזכויות שמורות ל-BSD-YBM",
  },
};

const en: RedesignCopy = {
  nav: { howItWorks: "How it works", modules: "Modules", pricing: "Pricing", contact: "Contact", signIn: "Sign in", register: "Get started" },
  hero: {
    blessing: "With God's help",
    title: "Your whole construction business — in one place",
    subtitle:
      "Projects, clients, documents and finance — from the field to the office. Snap an invoice on your phone and AI files it and updates the project for you.",
    ctaPrimary: "Start free",
    ctaSecondary: "Watch the demo",
    trust: "Hundreds of contractors and field crews already work smarter with BSD-YBM",
  },
  proof: {
    items: [
      { value: "−8 hrs", label: "less paperwork per week, on average" },
      { value: "1 system", label: "instead of 5 separate apps" },
      { value: "30 sec", label: "from a scan to a filed project document" },
    ],
  },
  value: {
    title: "Tired of chasing paperwork?",
    subtitle: "Instead of WhatsApp, Excel and folders — everything flows into one place automatically.",
    cards: [
      { title: "Everything in one place", body: "Clients, projects, invoices, quotes and calendar — no app-hopping, nothing slips through the cracks." },
      { title: "From the field, no office", body: "Photograph a document or talk to your phone — AI fills it in, files it and updates the right project." },
      { title: "AI that knows your business", body: "Not a generic chat — an assistant that knows your clients, projects and status, and suggests the next step." },
    ],
  },
  demo: { label: "Live demo", title: "Try it yourself — no login", subtitle: "Upload an invoice or photo and watch Gemini Vision read it in real time." },
  how: {
    title: "Field to office in three steps",
    subtitle: "No typing, no manual filing.",
    steps: [
      { title: "1 · Snap or speak", body: "Invoice, delivery note, work log — a photo or a voice command." },
      { title: "2 · AI organizes", body: "It recognizes, fills fields, files to the right project and updates status." },
      { title: "3 · Full control", body: "One dashboard: project profit, collections, invoices and next steps — in real time." },
    ],
  },
  modules: {
    title: "Everything a construction business needs",
    subtitle: "Modules that work together — turn on what you need, when you need it.",
    items: [
      { title: "CRM", body: "Every client, supplier and contact in one place, with full history." },
      { title: "Projects", body: "A control center: tasks, schedules and profit per site." },
      { title: "Docs & scanning", body: "Smart scanning, archive, invoices and quotes." },
      { title: "Finance", body: "Cash flow, collections and invoices — no Excel." },
      { title: "Field Copilot", body: "A mobile assistant for crews: voice, photo and quick updates." },
      { title: "AI Hub", body: "A smart assistant that knows your data and acts for you." },
    ],
  },
  industries: {
    title: "Built for every construction trade",
    subtitle: "Adapts to your specialty.",
    tags: ["Structural", "Renovation", "Electrical", "Plumbing", "HVAC", "Tiling & cladding", "Finishing & infra", "Subcontractors"],
  },
  pricing: {
    title: "Simple, fair pricing",
    subtitle: "Start free. Upgrade as you grow.",
    plans: [
      { name: "Starter", price: "$0", period: "/ mo", features: ["1 user", "CRM & projects", "Basic doc scanning", "No credit card"], cta: "Start free" },
      { name: "Pro", price: "$39", period: "/ mo", features: ["Up to 5 users", "All modules", "AI Hub + Field Copilot", "Collections & invoices", "Priority support"], cta: "Start now", featured: true },
      { name: "Enterprise", price: "Custom", period: "", features: ["Unlimited users", "Advanced integrations", "Onboarding & guidance", "Dedicated SLA"], cta: "Talk to us" },
    ],
    note: "All plans include ongoing updates and passwordless security (Passkey).",
  },
  faq: {
    title: "Frequently asked",
    items: [
      { q: "Do I need to install anything?", a: "No. It runs in the browser and on your phone, no install. Sign in and start." },
      { q: "Is it good for a small / solo contractor?", a: "Absolutely. Start free with one user and upgrade only when needed." },
      { q: "How does scanning work?", a: "Photograph an invoice or document and AI (Gemini) reads the details and fills them in." },
      { q: "Is my data secure?", a: "Yes. Passwordless sign-in (Passkey/Face ID) and encryption. Your data is yours alone." },
      { q: "Can I work from the field with poor signal?", a: "The UI is light and fast, built for phones and working on the move." },
    ],
  },
  finalCta: { title: "Ready to work smarter?", subtitle: "Open a free account in 2 minutes — no credit card, no commitment.", primary: "Start free", secondary: "Talk to us" },
  footer: { tagline: "The business OS for construction and the field.", rights: "All rights reserved to BSD-YBM" },
};

const ru: RedesignCopy = {
  nav: { howItWorks: "Как это работает", modules: "Модули", pricing: "Цены", contact: "Контакт", signIn: "Вход", register: "Начать" },
  hero: {
    blessing: "С Божьей помощью",
    title: "Весь ваш строительный бизнес — в одном месте",
    subtitle:
      "Проекты, клиенты, документы и финансы — от объекта до офиса. Сфотографируйте счёт, и AI сам всё подошьёт и обновит проект.",
    ctaPrimary: "Начать бесплатно",
    ctaSecondary: "Смотреть демо",
    trust: "Сотни подрядчиков и бригад уже работают умнее с BSD-YBM",
  },
  proof: {
    items: [
      { value: "−8 ч", label: "меньше бумажной работы в неделю" },
      { value: "1 система", label: "вместо 5 отдельных приложений" },
      { value: "30 сек", label: "от снимка до подшитого документа" },
    ],
  },
  value: {
    title: "Устали гоняться за бумагами?",
    subtitle: "Вместо WhatsApp, Excel и папок — всё автоматически в одном месте.",
    cards: [
      { title: "Всё в одном месте", body: "Клиенты, проекты, счета, сметы и календарь — без прыжков между приложениями." },
      { title: "С объекта, без офиса", body: "Сфотографируйте документ или скажите голосом — AI заполнит, подошьёт и обновит проект." },
      { title: "AI, знающий ваш бизнес", body: "Не общий чат — ассистент, знающий клиентов, проекты и статус, и подсказывающий следующий шаг." },
    ],
  },
  demo: { label: "Живое демо", title: "Попробуйте сами — без входа", subtitle: "Загрузите счёт или фото и смотрите, как Gemini Vision читает его в реальном времени." },
  how: {
    title: "От объекта до офиса за три шага",
    subtitle: "Без набора текста и ручной подшивки.",
    steps: [
      { title: "1 · Снимок или голос", body: "Счёт, накладная, журнал работ — фото или голосовая команда." },
      { title: "2 · AI наводит порядок", body: "Распознаёт, заполняет поля, подшивает к проекту и обновляет статус." },
      { title: "3 · Полный контроль", body: "Одна панель: прибыль проекта, сборы, счета и следующие шаги — в реальном времени." },
    ],
  },
  modules: {
    title: "Всё, что нужно строительному бизнесу",
    subtitle: "Модули работают вместе — включайте нужное, когда нужно.",
    items: [
      { title: "CRM", body: "Каждый клиент, поставщик и контакт в одном месте, с полной историей." },
      { title: "Проекты", body: "Центр управления: задачи, графики и прибыль по объектам." },
      { title: "Документы и сканы", body: "Умное сканирование, архив, счета и сметы." },
      { title: "Финансы", body: "Денежный поток, сборы и счета — без Excel." },
      { title: "Field Copilot", body: "Мобильный ассистент для бригад: голос, фото и быстрые обновления." },
      { title: "AI Hub", body: "Умный ассистент, знающий ваши данные и действующий за вас." },
    ],
  },
  industries: {
    title: "Создано для всех строительных специальностей",
    subtitle: "Подстраивается под вашу специализацию.",
    tags: ["Каркас", "Ремонт", "Электрика", "Сантехника", "ОВиК", "Плитка и облицовка", "Отделка и инфра", "Субподряд"],
  },
  pricing: {
    title: "Простые честные цены",
    subtitle: "Начните бесплатно. Расширяйтесь по мере роста.",
    plans: [
      { name: "Старт", price: "$0", period: "/ мес", features: ["1 пользователь", "CRM и проекты", "Базовое сканирование", "Без карты"], cta: "Начать бесплатно" },
      { name: "Про", price: "$39", period: "/ мес", features: ["До 5 пользователей", "Все модули", "AI Hub + Field Copilot", "Сборы и счета", "Приоритетная поддержка"], cta: "Начать сейчас", featured: true },
      { name: "Энтерпрайз", price: "Индивид.", period: "", features: ["Без ограничений", "Расширенные интеграции", "Внедрение и сопровождение", "Выделенный SLA"], cta: "Связаться" },
    ],
    note: "Все планы включают обновления и вход без паролей (Passkey).",
  },
  faq: {
    title: "Частые вопросы",
    items: [
      { q: "Нужно что-то устанавливать?", a: "Нет. Работает в браузере и на телефоне, без установки." },
      { q: "Подходит малому / частному подрядчику?", a: "Да. Начните бесплатно с одним пользователем." },
      { q: "Как работает сканирование?", a: "Сфотографируйте счёт, и AI (Gemini) прочитает данные и заполнит их." },
      { q: "Мои данные в безопасности?", a: "Да. Вход без паролей (Passkey/Face ID) и шифрование." },
      { q: "Можно работать с объекта при плохой связи?", a: "Интерфейс лёгкий и быстрый, создан для телефона в движении." },
    ],
  },
  finalCta: { title: "Готовы работать умнее?", subtitle: "Откройте бесплатный аккаунт за 2 минуты — без карты и обязательств.", primary: "Начать бесплатно", secondary: "Связаться" },
  footer: { tagline: "Бизнес-ОС для строительства и объекта.", rights: "Все права защищены BSD-YBM" },
};

const COPY: Record<RedesignLocale, RedesignCopy> = { he, en, ru };

export function getRedesignCopy(locale: string): RedesignCopy {
  if (locale === "en") return en;
  if (locale === "ru") return ru;
  return COPY.he;
}
