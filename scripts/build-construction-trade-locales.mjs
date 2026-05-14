/**
 * מייצר messages/construction-trades.en.json ו־construction-trades.ru.json
 * הרצה: node scripts/build-construction-trade-locales.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "messages");

const labelsEn = {
  GENERAL_CONTRACTOR: "General contractor / site lead",
  ELECTRICAL: "Electrical contractor",
  PLUMBING: "Plumbing & drainage",
  HVAC: "HVAC",
  PAINTING: "Painting & finishing",
  FLOORING: "Flooring & stone",
  ALUMINUM: "Aluminum & glass",
  FINISHING: "Interior finishing",
  LANDSCAPING: "Landscaping & exterior",
  SUBCONTRACTOR_OTHER: "Subcontractor / other",
};

const labelsRu = {
  GENERAL_CONTRACTOR: "Генподрядчик / руководство объектом",
  ELECTRICAL: "Электромонтаж",
  PLUMBING: "Сантехника и канализация",
  HVAC: "Вентиляция и кондиционирование",
  PAINTING: "Малярные и отделочные работы",
  FLOORING: "Напольные покрытия и камень",
  ALUMINUM: "Алюминий и стекло",
  FINISHING: "Внутренняя отделка",
  LANDSCAPING: "Ландшафт и благоустройство",
  SUBCONTRACTOR_OTHER: "Субподряд / другое",
};

const tradesEn = {
  ELECTRICAL: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / electrical panel",
      document: "Test certificates, purchase orders & electrical invoices",
      inventory: "Electrical materials, panels & lighting",
    },
    clientsLabel: "Clients, contractors & electrical sites",
    documentsLabel: "Certificates, drawings & electrical purchase orders",
    recordsLabel: "Installation approvals, inspections & electrical QA",
    homeTitle: "Operations hub for electrical crews — site to paperwork.",
    homeDescription:
      "Site logs, test certificates, supplier POs and invoices in one workspace, with AI tuned to electrical norms and safety.",
    scanner: {
      title: "Electrical document intelligence",
      subtitle: "Test certs, material orders & supplier invoices — electrical context",
      dropzoneTitle: "Upload test certificates, invoices or material orders",
      dropzoneSub: "Track panels, circuits and approvals on site",
    },
    templates: [
      { id: "SITE_LOG", label: "Site daily log", description: "Crew, panels, milestones & progress.", kind: "REPORT" },
      {
        id: "ELEC_TEST_APPROVAL",
        label: "Test / installation certificate",
        description: "Signed electrical inspection with standard references.",
        kind: "APPROVAL",
      },
      {
        id: "ELEC_SUPPLY_APPROVAL",
        label: "Electrical material supply approval",
        description: "Confirm receipt of cables, boards or fixtures.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Electrical works invoice",
        description: "Official billing for phases or projects.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      ELECTRICAL_TEST_CERT: {
        label: "Test certificate / installation approval",
        description: "Detect standard, inspection date and signatories",
      },
      MATERIAL_ORDER: { label: "Material / supplier order", description: "Cables, boards, lighting — quantities & prices" },
      SITE_LOG: { label: "Site work log", description: "Crew, phases and daily progress" },
    },
  },
  PLUMBING: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / system (water / drainage / collectors)",
      document: "Pipe orders, pressure tests & supplier invoices",
      inventory: "Pipes, fittings & seals",
    },
    clientsLabel: "Clients, contractors & plumbing sites",
    documentsLabel: "Material orders, pressure tests & water / drainage plans",
    recordsLabel: "Plumbing approvals, pressure tests & supply records",
    homeTitle: "Operations hub for plumbers — field docs & approvals.",
    homeDescription:
      "Track orders, pressure tests, site logs and supplier invoices with AI that understands water and drainage systems.",
    scanner: {
      title: "Plumbing document intelligence",
      subtitle: "Pipe orders, deliveries, collectors & suppliers",
      dropzoneTitle: "Upload pipe schedules, pressure tests or POs",
      dropzoneSub: "Monitor systems, suppliers and site progress",
    },
    templates: [
      { id: "SITE_LOG", label: "Site daily log", description: "Crew, phases and daily progress.", kind: "REPORT" },
      {
        id: "PLUMB_PRESSURE_APPROVAL",
        label: "Pressure / leak-test approval",
        description: "Signed test record with results.",
        kind: "APPROVAL",
      },
      {
        id: "PLUMB_MATERIAL_APPROVAL",
        label: "Plumbing material supply approval",
        description: "Confirm materials received on site.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Plumbing invoice",
        description: "Official billing for works or phases.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      PLUMBING_SUPPLY_ORDER: { label: "Material order (pipes / fittings)", description: "Line items, quantities & supplier" },
      PRESSURE_TEST_REPORT: { label: "Pressure / leak test", description: "Dates, outcomes and approvals" },
      SITE_LOG: { label: "Site work log", description: "Crew progress on site" },
    },
  },
  HVAC: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / HVAC system",
      document: "Equipment orders, commissioning & supplier invoices",
      inventory: "HVAC units, copper lines & accessories",
    },
    clientsLabel: "Clients, contractors & HVAC sites",
    documentsLabel: "Equipment orders, commissioning & installation reports",
    recordsLabel: "Startup approvals, commissioning checks & supplier docs",
    homeTitle: "Operations hub for HVAC — equipment, sites & approvals.",
    homeDescription:
      "Track units, commissioning logs, site diaries and invoices with AI that reads model numbers, capacities and locations.",
    scanner: {
      title: "HVAC document intelligence",
      subtitle: "Units, chillers, installs & balancing",
      dropzoneTitle: "Upload HVAC orders, commissioning sheets or photos",
      dropzoneSub: "Follow equipment tags and milestones on site",
    },
    templates: [
      { id: "SITE_LOG", label: "Site installation log", description: "Crews, phases and progress.", kind: "REPORT" },
      {
        id: "HVAC_COMMISSION_APPROVAL",
        label: "Commissioning / completion approval",
        description: "Signed startup checklist for handover.",
        kind: "APPROVAL",
      },
      {
        id: "HVAC_EQUIP_APPROVAL",
        label: "HVAC equipment delivery approval",
        description: "Confirm units and accessories received.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "HVAC invoice",
        description: "Official billing for project or phase.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      HVAC_ORDER: { label: "HVAC equipment order", description: "Models, kW/BTU and quantities" },
      COMMISSIONING_DOC: { label: "Commissioning / startup", description: "Startup tests and dates" },
      SITE_LOG: { label: "Site work log", description: "Crew and progress" },
    },
  },
  PAINTING: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / floor & space",
      document: "Paint quantities, material orders & field reports",
      inventory: "Paint, tools & application materials",
    },
    clientsLabel: "Clients, contractors & painting sites",
    documentsLabel: "Quantities, paint orders & finishing drawings",
    recordsLabel: "Finishing-stage approvals, quantities & deliveries",
    homeTitle: "Operations hub for paint & finishing — areas, materials & approvals.",
    homeDescription:
      "Manage quantities, orders, site logs and invoices with AI that understands coats, colors and square meters.",
    scanner: {
      title: "Paint & finishing document intelligence",
      subtitle: "Areas, materials and coats",
      dropzoneTitle: "Upload paint schedules, BOQs or delivery notes",
      dropzoneSub: "Track layers, colors and coverage",
    },
    templates: [
      { id: "SITE_LOG", label: "Site daily log", description: "Finishing stages, crews & progress.", kind: "REPORT" },
      {
        id: "PAINT_SCOPE_APPROVAL",
        label: "Paint scope / stage approval",
        description: "Approve quantities or completion of a paint stage.",
        kind: "APPROVAL",
      },
      {
        id: "PAINT_MATERIAL_APPROVAL",
        label: "Paint & consumables supply approval",
        description: "Confirm receipt of buckets and materials.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Painting & finishing invoice",
        description: "Official billing per phase or m².",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      PAINT_QUANTITY: { label: "Paint quantities / areas", description: "m², coats and paint system" },
      MATERIAL_ORDER: { label: "Material order", description: "Buckets, rollers, application" },
      SITE_LOG: { label: "Site work log", description: "Finishing stages" },
    },
  },
  FLOORING: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / room & floor",
      document: "Tile orders, delivery notes & measurements",
      inventory: "Tile, stone & adhesives",
    },
    clientsLabel: "Clients, contractors & flooring sites",
    documentsLabel: "m² orders, delivery notes & shop drawings",
    recordsLabel: "Supply approvals, batches & flooring completion",
    homeTitle: "Operations hub for flooring & stone — quantities, supply & approvals.",
    homeDescription:
      "Track m² orders, batches, deliveries and site logs with AI that reads SKUs and quantities.",
    scanner: {
      title: "Flooring & stone document intelligence",
      subtitle: "Cuts, quantities and logistics",
      dropzoneTitle: "Upload tile orders, delivery notes or layouts",
      dropzoneSub: "Monitor batches and installation progress",
    },
    templates: [
      { id: "SITE_LOG", label: "Site daily log", description: "Flooring crews & phases.", kind: "REPORT" },
      {
        id: "FLOOR_DELIVERY_APPROVAL",
        label: "Flooring / batch delivery approval",
        description: "Confirm materials received on site.",
        kind: "APPROVAL",
      },
      {
        id: "FLOOR_PHASE_APPROVAL",
        label: "Flooring phase completion approval",
        description: "Approve handover of area or phase.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Flooring invoice",
        description: "Official billing for areas or phases.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      TILE_ORDER: { label: "Tile / ceramic order", description: "Sizes, m² and batch" },
      DELIVERY_NOTE: { label: "Delivery note", description: "Items delivered to site" },
      SITE_LOG: { label: "Site work log", description: "Progress" },
    },
  },
  ALUMINUM: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / openings & floors",
      document: "Measurements, profile & glass orders",
      inventory: "Profiles, glass & installation hardware",
    },
    clientsLabel: "Clients, contractors & aluminum sites",
    documentsLabel: "Opening drawings, profile & glass orders",
    recordsLabel: "Measurement approvals, supply & installation",
    homeTitle: "Operations hub for aluminum & glass — openings, sizes & approvals.",
    homeDescription:
      "Measurements, orders, installation logs and invoices with AI that reads profiles and glass specs.",
    scanner: {
      title: "Aluminum & glass document intelligence",
      subtitle: "Frames, sizes and fabrication",
      dropzoneTitle: "Upload shop drawings, orders or site photos",
      dropzoneSub: "Track openings and fabrication status",
    },
    templates: [
      { id: "SITE_LOG", label: "Site installation log", description: "Openings, crews & progress.", kind: "REPORT" },
      {
        id: "ALU_MEASURE_APPROVAL",
        label: "Measurement / fabrication approval",
        description: "Signed measurements for production.",
        kind: "APPROVAL",
      },
      {
        id: "ALU_GLASS_APPROVAL",
        label: "Glass / profile supply approval",
        description: "Confirm materials received on site.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Aluminum invoice",
        description: "Official billing per phase or opening.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      ALU_MEASUREMENT: { label: "Measurements / sash drawing", description: "Opening sizes and profiles" },
      GLASS_ORDER: { label: "Glass order", description: "Thickness, type and dimensions" },
      SITE_LOG: { label: "Installation log", description: "Site execution" },
    },
  },
  FINISHING: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / interior space",
      document: "Joinery & kitchen orders and delivery notes",
      inventory: "Doors, kitchens & built-ins",
    },
    clientsLabel: "Clients, contractors & interior finishing sites",
    documentsLabel: "Joinery & kitchen orders and delivery notes",
    recordsLabel: "Installation approvals, handovers & finishing stages",
    homeTitle: "Operations hub for interior finishing — kitchens, doors & approvals.",
    homeDescription:
      "Orders, deliveries, installation logs and invoices in one place with AI tuned to joinery and kitchens.",
    scanner: {
      title: "Interior finishing document intelligence",
      subtitle: "Doors, kitchens, cabinets — orders & supply",
      dropzoneTitle: "Upload kitchen/joinery orders or delivery notes",
      dropzoneSub: "Track rooms, suppliers and install progress",
    },
    templates: [
      { id: "SITE_LOG", label: "Site work & install log", description: "Spaces, crews & phases.", kind: "REPORT" },
      {
        id: "FINISH_INSTALL_APPROVAL",
        label: "Finishing install / handover approval",
        description: "Approve item or room handover to client.",
        kind: "APPROVAL",
      },
      {
        id: "FINISH_SUPPLY_APPROVAL",
        label: "Finishing supply approval",
        description: "Confirm receipt of kitchen, doors or casework.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Interior finishing invoice",
        description: "Official billing per phase or item.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      JOINERY_ORDER: { label: "Joinery / kitchen order", description: "Specs and delivery dates" },
      DELIVERY_NOTE: { label: "Delivery note", description: "Items received" },
      SITE_LOG: { label: "Site work log", description: "Installation" },
    },
  },
  LANDSCAPING: {
    vocabulary: {
      client: "Client / general contractor",
      project: "Site / landscape zone",
      document: "Quotes, plant & irrigation orders",
      inventory: "Plants, hardscape & irrigation parts",
    },
    clientsLabel: "Clients, contractors & landscaping sites",
    documentsLabel: "Quotes, material orders & landscape plans",
    recordsLabel: "Execution approvals, supply & exterior phases",
    homeTitle: "Operations hub for landscaping & exterior — scope, materials & approvals.",
    homeDescription:
      "Quotes, supply, site logs and invoices with AI that understands irrigation, planting and hardscape.",
    scanner: {
      title: "Landscaping document intelligence",
      subtitle: "Planting, irrigation, exterior paving",
      dropzoneTitle: "Upload landscape quotes, irrigation BOMs or photos",
      dropzoneSub: "Track zones, materials and execution",
    },
    templates: [
      { id: "SITE_LOG", label: "Field work log", description: "Execution, crews & progress.", kind: "REPORT" },
      {
        id: "LAND_PHASE_APPROVAL",
        label: "Landscape / exterior phase approval",
        description: "Approve completion of phase or zone.",
        kind: "APPROVAL",
      },
      {
        id: "LAND_SUPPLY_APPROVAL",
        label: "Plant / material supply approval",
        description: "Confirm materials received on site.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Landscaping invoice",
        description: "Official billing per phase or scope.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      LANDSCAPE_QUOTE: { label: "Landscaping quote", description: "Areas, trees, irrigation system" },
      IRRIGATION_PARTS: { label: "Irrigation parts", description: "Sprinklers, pipes, controllers" },
      SITE_LOG: { label: "Site work log", description: "Execution" },
    },
  },
  SUBCONTRACTOR_OTHER: {
    vocabulary: {
      client: "General contractor / client",
      project: "Site / sub-package",
      document: "Quotes, progress invoices & field reports",
      inventory: "Materials by sub-package",
    },
    clientsLabel: "General contractors & clients",
    documentsLabel: "Sub quotes, progress billing & field certificates",
    recordsLabel: "Progress approvals, supply & phase close-out",
    homeTitle: "Operations hub for subcontractors — quotes, execution & billing.",
    homeDescription:
      "Manage quotes, progress invoices, site diaries and approvals with AI tuned to subcontract packages.",
    scanner: {
      title: "Subcontractor document intelligence",
      subtitle: "Quotes, invoices and field evidence",
      dropzoneTitle: "Upload sub quotes, progress bills or site reports",
      dropzoneSub: "Track phases, percentages and cashflow",
    },
    templates: [
      { id: "SITE_LOG", label: "Field reporting log", description: "Execution, crew and daily notes.", kind: "REPORT" },
      {
        id: "SUB_PROGRESS_APPROVAL",
        label: "Progress / percentage approval",
        description: "Approve phase or percent complete.",
        kind: "APPROVAL",
      },
      {
        id: "SUB_QUOTE_ACCEPTANCE",
        label: "Sub quote acceptance / adjustment",
        description: "Document approval or scope change.",
        kind: "APPROVAL",
      },
      {
        id: "INVOICE",
        label: "Progress / sub invoice",
        description: "Official billing by phase or percent.",
        kind: "OFFICIAL",
        issuedDocumentType: "INVOICE",
      },
    ],
    analysisTypes: {
      SUB_QUOTE: { label: "Subcontractor quote", description: "Scope, units and pricing" },
      PROGRESS_INVOICE: { label: "Progress / application invoice", description: "Percentages and stages" },
      SITE_LOG: { label: "Site work log", description: "Field reporting" },
    },
  },
};

/** תוויות עמודות תוצאות סורק — מפתח = key מקוד המקור */
const RESULT_COLUMNS_EN = {
  ELECTRICAL: {
    site_or_panel: "Site / panel",
    standard_ref: "Standard / sign-off",
    approval_status: "Status",
  },
  PLUMBING: {
    system_type: "System (water / drain / tank)",
    material_type: "Main material",
    supplier: "Supplier",
  },
  HVAC: {
    equipment_tag: "Equipment / model",
    capacity: "Capacity / output",
    location: "Location on site",
  },
  PAINTING: {
    area_sqm: "Area (m²)",
    layers: "Coats",
    color_code: "Color / code",
  },
  FLOORING: {
    tile_sku: "SKU / size",
    qty_sqm: "Qty (m²)",
    batch: "Batch",
  },
  ALUMINUM: {
    opening_ref: "Opening",
    profile: "Profile",
    glass_spec: "Glass spec",
  },
  FINISHING: {
    room_ref: "Space",
    item_desc: "Item",
    supplier: "Supplier",
  },
  LANDSCAPING: {
    zone: "Zone",
    plant_or_material: "Plant / material",
    qty: "Quantity",
  },
  SUBCONTRACTOR_OTHER: {
    project_site: "Site",
    phase: "Phase",
    total: "Total",
  },
};

for (const k of Object.keys(RESULT_COLUMNS_EN)) {
  if (tradesEn[k]) {
    tradesEn[k].resultColumns = RESULT_COLUMNS_EN[k];
  }
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key];
    const av = a[key];
    if (bv && typeof bv === "object" && !Array.isArray(bv) && av && typeof av === "object" && !Array.isArray(av)) {
      out[key] = deepMerge(av, bv);
    } else {
      out[key] = bv;
    }
  }
  return out;
}

/** רוסית — מיזוג עמוק על בסיס האנגלית */
const tradesRu = deepMerge(JSON.parse(JSON.stringify(tradesEn)), {
  ELECTRICAL: {
    vocabulary: {
      client: "Заказчик / генподрядчик",
      project: "Объект / электрощит",
      document: "Акты проверки, заказы и счета по электрике",
      inventory: "Электроматериалы, щиты и свет",
    },
    clientsLabel: "Заказчики, подрядчики и электромонтажные объекты",
    documentsLabel: "Акты, проекты и заказы на электромонтаж",
    recordsLabel: "Акты монтажа, испытания и электробезопасность",
    homeTitle: "Центр управления для электромонтажников — от объекта до документов.",
    homeDescription:
      "Дневники работ, акты, заказы поставщиков и счета в одном интерфейсе с ИИ, настроенным на электротехнику.",
    scanner: {
      title: "Разбор документов по электрике",
      subtitle: "Акты, заказы материалов и счета поставщиков",
      dropzoneTitle: "Загрузите акты проверки, счета или заказы",
      dropzoneSub: "Учёт щитов, цепей и допусков на объекте",
    },
  },
  PLUMBING: {
    vocabulary: {
      client: "Заказчик / генподрядчик",
      project: "Объект / система (вода / канализация)",
      document: "Заказы труб, испытания давления и счета",
      inventory: "Трубы, фитинги и уплотнения",
    },
    clientsLabel: "Заказчики, подрядчики и объекты сантехники",
    documentsLabel: "Заказы, испытания давления и проекты водоснабжения",
    recordsLabel: "Акты сантехники, испытания и поставки",
    homeTitle: "Центр управления для сантехников — документы и акты.",
    homeDescription: "Заказы, испытания, дневники и счета с ИИ для воды и канализации.",
    scanner: {
      title: "Разбор сантехнических документов",
      subtitle: "Заказы труб, поставки и коллекторы",
      dropzoneTitle: "Загрузите спецификации, отчёты о давлении или заказы",
      dropzoneSub: "Контроль систем и поставщиков",
    },
  },
  HVAC: {
    clientsLabel: "Заказчики, подрядчики и объекты ВКВ",
    homeTitle: "Центр управления для ВКВ — оборудование, объекты, акты.",
    scanner: { title: "Разбор документов ВКВ", dropzoneTitle: "Загрузите заказы, пусконаладку или фото" },
  },
  PAINTING: {
    clientsLabel: "Заказчики и объекты малярных работ",
    homeTitle: "Центр управления для малярки и отделки.",
    scanner: { title: "Разбор документов по покраске", dropzoneTitle: "Загрузите ведомости, заказы или накладные" },
  },
  FLOORING: {
    clientsLabel: "Заказчики и объекты напольных покрытий",
    homeTitle: "Центр управления для плитки и камня.",
    scanner: { title: "Разбор документов по напольным покрытиям", dropzoneTitle: "Загрузите заказы, накладные или планы" },
  },
  ALUMINUM: {
    clientsLabel: "Заказчики и объекты алюминия/стекла",
    homeTitle: "Центр управления для алюминия и остекления.",
    scanner: { title: "Разбор документов по алюминию и стеклу", dropzoneTitle: "Загрузите чертежи, заказы или фото" },
  },
  FINISHING: {
    clientsLabel: "Заказчики и объекты внутренней отделки",
    homeTitle: "Центр управления для внутренней отделки.",
    scanner: { title: "Разбор документов отделки", dropzoneTitle: "Загрузите заказы кухонь/столярки или накладные" },
  },
  LANDSCAPING: {
    clientsLabel: "Заказчики и ландшафтные объекты",
    homeTitle: "Центр управления для ландшафта и двора.",
    scanner: { title: "Разбор ландшафтных документов", dropzoneTitle: "Загрузите сметы, спецификации орошения или фото" },
  },
  SUBCONTRACTOR_OTHER: {
    clientsLabel: "Генподрядчики и заказчики",
    homeTitle: "Центр управления для субподряда — сметы, выполнение, оплата.",
    scanner: { title: "Разбор документов субподряда", dropzoneTitle: "Загрузите сметы, счета по этапам или отчёты" },
  },
});

const RESULT_COLUMNS_RU = {
  ELECTRICAL: {
    site_or_panel: "Объект / щит",
    standard_ref: "Норма / допуск",
    approval_status: "Статус",
  },
  PLUMBING: {
    system_type: "Система (вода / канализация / бак)",
    material_type: "Основной материал",
    supplier: "Поставщик",
  },
  HVAC: {
    equipment_tag: "Оборудование / модель",
    capacity: "Мощность / производительность",
    location: "Место на объекте",
  },
  PAINTING: {
    area_sqm: "Площадь (м²)",
    layers: "Слои",
    color_code: "Цвет / код",
  },
  FLOORING: {
    tile_sku: "Артикул / размер",
    qty_sqm: "Кол-во (м²)",
    batch: "Партия",
  },
  ALUMINUM: {
    opening_ref: "Проём",
    profile: "Профиль",
    glass_spec: "Стекло",
  },
  FINISHING: {
    room_ref: "Помещение",
    item_desc: "Изделие",
    supplier: "Поставщик",
  },
  LANDSCAPING: {
    zone: "Зона",
    plant_or_material: "Растение / материал",
    qty: "Количество",
  },
  SUBCONTRACTOR_OTHER: {
    project_site: "Объект",
    phase: "Этап",
    total: "Итого",
  },
};

for (const k of Object.keys(RESULT_COLUMNS_RU)) {
  if (tradesRu[k]) {
    tradesRu[k].resultColumns = RESULT_COLUMNS_RU[k];
  }
}

fs.writeFileSync(
  path.join(root, "construction-trades.en.json"),
  JSON.stringify({ constructionTradeLabels: labelsEn, constructionTrades: tradesEn }, null, 2),
  "utf8",
);
fs.writeFileSync(
  path.join(root, "construction-trades.ru.json"),
  JSON.stringify({ constructionTradeLabels: labelsRu, constructionTrades: tradesRu }, null, 2),
  "utf8",
);

console.log("Wrote messages/construction-trades.en.json and .ru.json");
