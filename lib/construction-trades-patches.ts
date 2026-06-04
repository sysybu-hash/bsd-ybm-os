import type { ConstructionTradeId, ConstructionTradePatch } from "@/lib/construction-trades-types";

export const TRADE_PATCHES: Record<ConstructionTradeId, ConstructionTradePatch | null> = {
  GENERAL_CONTRACTOR: null,
  ELECTRICAL: {
    scanner: {
      title: "פענוח מסמכי חשמל ושטח",
      subtitle: "תעודות בדיקה, הזמנות חומר, חשבוניות ספק — בהקשר חשמלאי",
      dropzoneTitle: "העלה תעודות בדיקה, חשבוניות או הזמנות חומר",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש כבלים, לוחות, תאורה ואביזרים" },
        { id: "MATERIAL_ORDER", label: "הזמנת חומרים / הצעת מחיר", description: "השוואת כמויות ומחירי ציוד חשמל" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ציוד", description: "וידוא קבלת אביזרים וארונות חשמל באתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "סיכום יומי של צוותי חשמל, שעות והתקדמות" },
        { id: "ELECTRICAL_TEST_CERT", label: "תעודת בדיקה (בודק/חברת חשמל)", description: "זיהוי תקן, תאריך בדיקה, רג'קטים" },
        { id: "APPROVAL_CERT", label: "אישור התקנה / מסירה", description: "אישור עבודות הארקה, מיתוג ולוחות חשמל" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות חשמל", description: "סעיפי ביצוע, אומדן מחירי נקודות ותשתיות" }
      ],
      resultColumns: [
        { key: "cable_type", label: "סוג כבל (NYY/NYM/…)" },
        { key: "cable_length_meters", label: "מטר כבל" },
        { key: "socket_count", label: "כמות שקעים" },
        { key: "circuit_breaker_specs", label: "מפסקים (A)" },
        { key: "conduit_meters", label: "מטר תעלה" },
        { key: "panel_name", label: "שם לוח חשמל" },
      ],
    },
    aiInstructionsSuffix:
      "Extract electrical quantities with maximum precision. For each line item identify: cable_type (e.g. NYY 3×2.5mm², NYM 5×6mm²), cable_length_meters per cable type, socket_count and socket_type (שקע רגיל/מחשב/חיצוני), circuit_breaker_specs including amperage (A) and number of poles, panel_name or panel_id (e.g. לוח ראשי, לוח קומה 3), conduit_type and conduit_meters (תעלת PVC/מתכת), spotlight_count, junction_box_count, earthing_rod_count. Note Israeli standard SI 900 references, inspection certificate number, and inspector name if visible. Output numeric quantities only — never estimate.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / לוח חשמל",
      document: "תעודות בדיקה, הזמנות וחשבוניות חשמל",
      inventory: "חומר חשמל, לוחות ותאורה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "תעודות, תוכניות והזמנות בתחום החשמל",
      recordsLabel: "אישורי בדיקה, התקנה ובטיחות חשמל",
      homeTitle: "מרכז תפעול לצוותי חשמל — מהאתר ועד התיעוד.",
      homeDescription:
        "יומני עבודה, תעודות בדיקה, הזמנות ספק וחשבוניות בממשק אחד, עם פענוח AI שמותאם לחשמל ולתקני בטיחות.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "דיווח יומי, לוחות, שלבים והתקדמות.", kind: "REPORT" },
        {
          id: "ELEC_TEST_APPROVAL",
          label: "תעודת בדיקה / אישור התקנה",
          description: "תיעוד בדיקה חשמלית, תקן וחתימות מאשרות.",
          kind: "APPROVAL",
        },
        {
          id: "ELEC_SUPPLY_APPROVAL",
          label: "אישור אספקה / שימוש בחומר חשמל",
          description: "אישור קבלת כבלים, לוחות, תאורה או ציוד.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית עבודות חשמל",
          description: "חיוב רשמי לשלבים או לפרויקט.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  PLUMBING: {
    scanner: {
      title: "פענוח מסמכי אינסטלציה",
      subtitle: "הזמנות צינורות, אספקה, קולטים וספקים",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש אביזרים, צינורות, ברזים וכלים סניטריים" },
        { id: "PLUMBING_SUPPLY_ORDER", label: "הזמנת חומר / הצעת מחיר", description: "השוואת מחירים לצינורות (SP, פלסאון) ואביזרים" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח", description: "מעקב אחר הגעת חומרי צנרת לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "פירוט התקדמות יומית של אינסטלטורים" },
        { id: "PRESSURE_TEST_REPORT", label: "בדיקת לחץ / אטימות", description: "תיעוד בדיקות לחץ מים וביוב" },
        { id: "APPROVAL_CERT", label: "אישור שלב מים/ביוב", description: "מסירת תשתיות צנרת למזמין" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות אינסטלציה", description: "פירוט נקודות מים, ביוב וכלים סניטריים" }
      ],
      resultColumns: [
        { key: "pipe_material", label: "חומר צנרת (PPR/PVC/נחושת)" },
        { key: "pipe_diameter_mm", label: "קוטר (מ\"מ)" },
        { key: "pipe_length_meters", label: "מטר צנרת" },
        { key: "fitting_type", label: "סוג אביזר (מרפק/גיא…)" },
        { key: "fitting_count", label: "כמות אביזרים" },
        { key: "system_type", label: "מערכת (קר/חם/ביוב)" },
      ],
    },
    aiInstructionsSuffix:
      "Extract plumbing quantities with full precision. For each line item identify: pipe_material (PPR/PVC/copper/stainless/ductile), pipe_diameter_mm (e.g. 20mm, 25mm, 32mm, 40mm, 50mm, 63mm, 90mm, 110mm, 160mm), pipe_length_meters per diameter and material combination, system_type (מים קרים/מים חמים/ביוב/גשם), fitting_type (מרפק 90°/45°, גיא, מפחית, שסתום כדורי, ברז, ממסר, קולט רצפה), fitting_count per type. Also capture: water_heater_capacity_liters, pump_model and flow_rate_m3h, pressure_test_result_bar if present, connection_to_main (inch size). Separate hot/cold water runs. Israeli standard SI 1205 references if visible. Never estimate quantities.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / מערכת (מים/ביוב/קולטים)",
      document: "הזמנות צינורות, בדיקות לחץ וחשבוניות ספק",
      inventory: "צינורות, אביזרים ואטמים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות חומר, בדיקות לחץ ותוכניות מים/ביוב",
      recordsLabel: "אישורי אינסטלציה, בדיקות לחץ ואספקת צנרת",
      homeTitle: "מרכז תפעול לאינסטלטורים — מסמכי שטח ואישורים.",
      homeDescription: "מעקב אחר הזמנות, בדיקות לחץ, יומני עבודה וחשבוניות ספק, עם AI שמזהה מערכות מים וביוב.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "צוות, שלבים והתקדמות יומית.", kind: "REPORT" },
        {
          id: "PLUMB_PRESSURE_APPROVAL",
          label: "אישור בדיקת לחץ / אטימות",
          description: "תיעוד בדיקה חתומה ותוצאות.",
          kind: "APPROVAL",
        },
        {
          id: "PLUMB_MATERIAL_APPROVAL",
          label: "אישור אספקת צנרת / אביזרים",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית אינסטלציה",
          description: "חיוב רשמי לעבודות או לשלבים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  HVAC: {
    scanner: {
      title: "פענוח מסמכי מיזוג אוויר",
      subtitle: "יחידות, צ׳ילרים, התקנות ואיזון",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש מזגנים, צ'ילרים, תעלות ואביזרים" },
        { id: "HVAC_ORDER", label: "הזמנת ציוד / הצעת מחיר", description: "דגמים, BTU/קילווט, פתחי אוורור" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ממוזג", description: "קבלת מעבים, מאיידים ותעלות פח באתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "שלבי התקנה, תליית תעלות והרכבת יחידות" },
        { id: "COMMISSIONING_DOC", label: "בדיקת הפעלה / כיול (Commissioning)", description: "תאריכי הפעלה ראשונית, מדידות ספיקה וטמפ'" },
        { id: "APPROVAL_CERT", label: "אישור מסירה למזמין", description: "אישור העברת מערכת המיזוג לאחריות הלקוח" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות מיזוג אוויר", description: "פירוט תעלות, גרילים, ויחידות לפי חללים" }
      ],
      resultColumns: [
        { key: "unit_model", label: "דגם יחידה" },
        { key: "unit_type", label: "סוג (split/VRF/chiller)" },
        { key: "capacity_kw", label: "קיבולת (kW/BTU)" },
        { key: "refrigerant_type", label: "גז קירור (R410A…)" },
        { key: "indoor_count", label: "כמות יחידות פנים" },
        { key: "pipe_set_meters", label: "מטר צנרת נחושת" },
      ],
    },
    aiInstructionsSuffix:
      "Extract HVAC equipment data with full precision. For each unit identify: unit_model (exact catalog number), unit_type (split/multi-split/VRF/chiller/AHU/FCU/cassette), capacity_kw or BTU (both if available), refrigerant_type (R410A/R32/R22/R407C), indoor_unit_count and outdoor_unit_count per system, copper_pipe_set_meters and pipe_set_diameter_mm (e.g. 6mm+10mm for split). Also capture: duct_area_m2 or duct_length_m per section, diffuser_count and grille_count, commissioning_date, pressure_test_result_bar, refrigerant_charge_kg, warranty_months, electrical_supply_specs (kW/phase). Tag each unit by location (room/floor/zone). Never estimate — use only visible data.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / מערכת מיזוג",
      document: "הזמנות ציוד, כיולים וחשבוניות ספק",
      inventory: "יחידות מיזוג, צינורות נחושת ואביזרים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות ציוד, דוחות כיול והתקנה",
      recordsLabel: "אישורי השלמת התקנה, בדיקות הפעלה ותעודות ספק",
      homeTitle: "מרכז תפעול למיזוג אוויר — ציוד, אתרים ואישורים.",
      homeDescription: "מעקב אחר יחידות, דוחות כיול, יומני עבודה וחשבוניות, עם AI שמבין דגמים, הספקים ומיקומים באתר.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "התקנה, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "HVAC_COMMISSION_APPROVAL",
          label: "אישור כיול / השלמת התקנה",
          description: "תיעוד בדיקות הפעלה ומסירה למזמין.",
          kind: "APPROVAL",
        },
        {
          id: "HVAC_EQUIP_APPROVAL",
          label: "אישור אספקת ציוד מיזוג",
          description: "אישור קבלת יחידות ואביזרים.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית מיזוג",
          description: "חיוב רשמי לפרויקט או לשלב.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  PAINTING: {
    scanner: {
      title: "פענוח מסמכי צבע וגמר",
      subtitle: "כמויות שטח, חומרים ושכבות",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק צבע", description: "רכש דליי צבע, שליכט, שפכטל, מברשות" },
        { id: "PAINT_QUANTITY", label: "כתב כמויות / אומדן מ\"ר", description: "חישוב מ\"ר, מספר שכבות, סוג צבע ושליכט" },
        { id: "MATERIAL_ORDER", label: "הזמנת חומרי גמר / הצעת מחיר", description: "כמויות פח, דליים, רולרים וחומרי מריחה" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח גוונים", description: "קבלת פחי צבע וגוונים שהוזמנו לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "רישום שלבי הכנה (שפכטל, פריימר) וגמר" },
        { id: "APPROVAL_CERT", label: "אישור סיום שלב גמר", description: "אישור מסירת שטח צבוע או שליכט" }
      ],
      resultColumns: [
        { key: "surface_type", label: "סוג משטח (פנים/חוץ/תקרה)" },
        { key: "surface_area_m2", label: "שטח (מ\"ר)" },
        { key: "paint_product", label: "שם מוצר צבע" },
        { key: "coating_layers", label: "שכבות ציפוי" },
        { key: "shading_count", label: "מספר גוונים" },
        { key: "liter_count", label: "ליטרים" },
      ],
    },
    aiInstructionsSuffix:
      "Extract painting quantities with full detail. For each item identify: surface_type (קיר פנים/קיר חוץ/תקרה/מתכת/עץ), surface_area_m2 per surface type and location, paint_product_name (exact brand and product, e.g. Tambour Duco 20 White), paint_manufacturer, coating_system (number of coats: primer/undercoat/topcoat + technique e.g. רולר/ריסוס), shading_count (number of distinct color shades ordered), liter_count or kg_count per product, RAL_or_color_code if visible, texture_type (חלק/פיסול/פסים) if applicable, surface_prep_method (קרצוף/שפכטל/שליכט). Distinguish interior from exterior. Note any scaffolding mentions.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / קומה וחלל",
      document: "כמויות צבע, הזמנות חומר ודוחות שטח",
      inventory: "צבע, כלים וחומרי מריחה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "כמויות שטח, הזמנות צבע ותוכניות גמר",
      recordsLabel: "אישורי שלב גמר, כמויות ואספקה",
      homeTitle: "מרכז תפעול לצבע וגמר — שטחים, חומרים ואישורים.",
      homeDescription: "ניהול כמויות, הזמנות, יומני עבודה וחשבוניות עם AI שמבין שכבות, גוונים ושטחים.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "שלבי גמר, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "PAINT_SCOPE_APPROVAL",
          label: "אישור היקף צבע / שלב גמר",
          description: "אישור כמויות או סיום שלב צביעה.",
          kind: "APPROVAL",
        },
        {
          id: "PAINT_MATERIAL_APPROVAL",
          label: "אישור אספקת צבע וחומרים",
          description: "אישור קבלת דליים וחומרי מריחה.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית צביעה וגמר",
          description: "חיוב רשמי לשלבים או למ״ר.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  FLOORING: {
    scanner: {
      title: "פענוח מסמכי ריצוף ואבן",
      subtitle: "חתכים, כמויות ואספקה",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק קרמיקה", description: "רכש אריחים, חיפויים, רובה ודבקים" },
        { id: "TILE_ORDER", label: "הזמנת ריצוף / הצעת מחיר", description: "מידות, מ״ר, סוג אבן/קרמיקה ועלות" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ממשטח", description: "וידוא אצוות, פריטים שהגיעו ופגומים" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "התקדמות יומית של רצפים באתר" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות ריצוף וחיפוי", description: "פירוט מידות, פנלים ושטחי ריצוף" },
        { id: "APPROVAL_CERT", label: "אישור סיום ריצוף", description: "מסירת חלל או דירה לאחר רובה" }
      ],
      resultColumns: [
        { key: "material_type", label: "חומר (פורצלן/שיש/עץ)" },
        { key: "tile_size_cm", label: "מידת אריח (ס\"מ)" },
        { key: "area_m2", label: "שטח (מ\"ר)" },
        { key: "sku", label: "מק\"ט / קטלוג" },
        { key: "batch_number", label: "אצווה" },
        { key: "box_count", label: "כמות קרטונים" },
      ],
    },
    aiInstructionsSuffix:
      "Extract flooring quantities with full precision. For each item identify: material_type (פורצלן/קרמיקה/שיש/גרניט/פרקט עץ/ויניל/פלורא), tile_size_cm (e.g. 60×60, 120×60, 30×60), area_m2 per material per location, sku or catalog_number (exact code from supplier), batch_number or lot_number (critical for color matching), box_count and tiles_per_box, grout_color and grout_brand, adhesive_type (דבק רגיל/דבק אפוקסי/מונטז'). Also note: wastage_percent if stated, laying_pattern (ישר/אלכסוני/הרינגבון), floor_heating_underneath (yes/no). Separate floor tiles from wall tiles and exterior tiles.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / חלל ורצפה",
      document: "הזמנות ריצוף, תעודות משלוח ומדידות",
      inventory: "קרמיקה, אבן ודבקים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות מ״ר, תעודות משלוח ושרטוטים",
      recordsLabel: "אישורי אספקה, אצוות וסיום ריצוף",
      homeTitle: "מרכז תפעול לריצוף ואבן — כמויות, אספקה ואישורים.",
      homeDescription: "מעקב אחר הזמנות מ״ר, אצוות, משלוחים ויומני עבודה, עם AI שמזהה דגמים וכמויות.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "ריצוף, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "FLOOR_DELIVERY_APPROVAL",
          label: "אישור אספקת ריצוף / אצווה",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "FLOOR_PHASE_APPROVAL",
          label: "אישור סיום שלב ריצוף",
          description: "אישור מסירת שטח או שלב.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית ריצוף",
          description: "חיוב רשמי לשטחים או לשלבים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  ALUMINUM: {
    scanner: {
      title: "פענוח מסמכי אלומיניום וזכוכית",
      subtitle: "מסגרות, מידות וייצור",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק אלומיניום", description: "רכש פרופילים, זכוכית, פירזול ואטמים" },
        { id: "ALU_MEASUREMENT", label: "מדידות / שרטוט פתחים", description: "מידות פתחים, כנפיים, סוגי פרופיל (קליל, אקסטל)" },
        { id: "GLASS_ORDER", label: "הזמנת זכוכית למפעל", description: "עובי, מפרט (טריפלקס, בידודית, מחוסמת)" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח זכוכית/פרופיל", description: "אישור קבלת חלונות ודלתות מוכנים לאתר" },
        { id: "SITE_LOG", label: "יומן התקנות וכוח אדם", description: "תיעוד צוותי הרכבה לפי קומות ודירות" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות אלומיניום", description: "פירוט פתחים, ויטרינות, מעקות ומחירים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת פתחים", description: "בדיקת אטימות, תריסים, ומסירה למזמין" }
      ],
      resultColumns: [
        { key: "opening_type", label: "סוג פתח (חלון/דלת/ויטרינה)" },
        { key: "profile_system", label: "מערכת פרופיל" },
        { key: "dimensions_cm", label: "מידות (רוחב×גובה ס\"מ)" },
        { key: "glass_spec", label: "מפרט זכוכית" },
        { key: "quantity", label: "כמות פתחים" },
        { key: "ral_color", label: "גוון RAL / גימור" },
      ],
    },
    aiInstructionsSuffix:
      "Extract aluminum and glazing items with full technical precision. For each opening identify: opening_type (חלון נפתח/הזזה/ציר/ויטרינה/דלת כניסה/מעקה/פרגולה), profile_system brand (קליל/אקסטל/TECHNAL/ALUPROF/Schuco/Cortizo), opening_width_cm and opening_height_cm (exact), glass_spec (e.g. 4+16Ar+4 low-E, U=1.1, G=0.35; or 6mm tempered; or triple glazing), quantity per type, hardware_type (ציר/מנגנון הזזה/נעילה רב-נקודתית), RAL_color_code or surface_finish (אנודייז/צבע אלקטרוסטטי/עץ). Also note: mosquito_net (yes/no), roller_shutter (yes/no), apartment_or_floor_reference. If measurement schedule: extract table with opening_id, width, height, quantity.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / פתחים וקומות",
      document: "מדידות, הזמנות פרופיל וזכוכית",
      inventory: "פרופילים, זכוכית ואביזרי התקנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "שרטוטי פתחים, הזמנות פרופיל וזכוכית",
      recordsLabel: "אישורי מדידה, אספקה והתקנה",
      homeTitle: "מרכז תפעול לאלומיניום וזכוכית — פתחים, מידות ואישורים.",
      homeDescription: "מסמכי מדידה, הזמנות, יומני התקנה וחשבוניות, עם AI שמבין פרופילים ומפרטי זכוכית.",
      templates: [
        { id: "SITE_LOG", label: "יומן התקנה באתר", description: "פתחים, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "ALU_MEASURE_APPROVAL",
          label: "אישור מדידות / אישור ייצור",
          description: "תיעוד מדידות מאושרות לייצור.",
          kind: "APPROVAL",
        },
        {
          id: "ALU_GLASS_APPROVAL",
          label: "אישור אספקת זכוכית / פרופיל",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית אלומיניום",
          description: "חיוב רשמי לשלבים או לפתחים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  FINISHING: {
    scanner: {
      title: "פענוח מסמכי גמר פנים",
      subtitle: "דלתות, מטבחים, ארונות — הזמנות ואספקה",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק נגרות/גמר", description: "רכש דלתות פנים, מטבחים, פרזול וארונות" },
        { id: "JOINERY_ORDER", label: "הזמנת נגרות / שרטוט נגר", description: "מפרטים, מידות מדויקות, צירי בלום" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ריהוט/דלתות", description: "מעקב אחר קבלת פריטי גמר לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה / התקנות גמר", description: "תיעוד ימי התקנת דלתות, מטבחים וחיפויים" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות גמר פנים", description: "פירוט עלויות נגרות, חיפוי קיר, וכלים לבנים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת גמר", description: "טופס בדיקת איכות ומסירת חללים ללקוח קצה" }
      ],
      resultColumns: [
        { key: "item_type", label: "סוג פריט (מטבח/ארון/דלת)" },
        { key: "dimensions_cm", label: "מידות (W×H×D ס\"מ)" },
        { key: "material", label: "חומר (MDF/עץ מלא/לכה)" },
        { key: "quantity", label: "כמות" },
        { key: "color_finish", label: "גוון / גימור" },
        { key: "hardware_brand", label: "פירזול (Blum/Hettich…)" },
      ],
    },
    aiInstructionsSuffix:
      "Extract interior finishing items with full specification detail. For each item identify: item_type (מטבח/ארון בגדים/דלת פנים/ארון אמבטיה/ספרייה מובנית/חיפוי קיר MDF), dimensions_cm (W×H×D — exact if stated), material (MDF גולמי/MDF לכה/עץ מלא/פורמייקה/אקריליק/בטון), color_finish (RAL code or descriptive color name), quantity of each item, hardware_brand (Blum/Hettich/Grass/Sugatsune/MEPLA), door_type if relevant (חלוקה/ללא ידית/ריקוע), room_reference (מטבח דירה 3/חדר שינה ראשי). For kitchens: extract separately uppers vs. lowers, island if present, countertop_material and countertop_length_cm. Note manufacturer and lead_time_weeks if visible.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / חלל פנים",
      document: "הזמנות נגרות, מטבחים ותעודות משלוח",
      inventory: "דלתות, מטבחים וריהוט מובנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות נגרות, מטבחים ותעודות אספקה",
      recordsLabel: "אישורי התקנה, מסירה ושלבי גמר",
      homeTitle: "מרכז תפעול לגמר פנים — מטבחים, דלתות ואישורים.",
      homeDescription: "הזמנות, משלוחים, יומני התקנה וחשבוניות במקום אחד, עם AI שמבין מפרטי נגרות ומטבח.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה והתקנה", description: "חללים, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "FINISH_INSTALL_APPROVAL",
          label: "אישור התקנת גמר / מסירה",
          description: "אישור מסירת פריט או חלל ללקוח.",
          kind: "APPROVAL",
        },
        {
          id: "FINISH_SUPPLY_APPROVAL",
          label: "אישור אספקת גמר",
          description: "אישור קבלת מטבח, דלתות או ריהוט.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית גמר פנים",
          description: "חיוב רשמי לשלבים או לפריטים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  LANDSCAPING: {
    scanner: {
      title: "פענוח מסמכי גינון וחוץ",
      subtitle: "צמחייה, השקיה, ריצוף חוץ",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית משתלה / ספק", description: "רכש צמחייה, אדמה, טוף, מחשבי השקיה" },
        { id: "LANDSCAPE_QUOTE", label: "כתב כמויות / הצעת גינון", description: "פירוט שטחי דשא, כמות עצים, ורכיבי השקיה" },
        { id: "IRRIGATION_PARTS", label: "הזמנת מערכת השקיה", description: "ממטרות, צינורות טפטוף, ברזים חשמליים" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח", description: "קבלת כדי ענק, דשא מוכן, חלוקי נחל וצמחים" },
        { id: "SITE_LOG", label: "יומן עבודות פיתוח", description: "תיעוד יומיומי של צוותי גינון וטרקטורים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת שטח חוץ", description: "בדיקת גינון, השקיה ופיתוח פיתוח סביבתי" }
      ],
      resultColumns: [
        { key: "plant_species", label: "מין צמח (עברי+לטיני)" },
        { key: "plant_quantity", label: "כמות צמחים / עצים" },
        { key: "area_m2", label: "שטח (מ\"ר)" },
        { key: "irrigation_type", label: "סוג השקיה (טפטוף/ממטרה)" },
        { key: "paving_material", label: "חומר ריצוף חוץ" },
        { key: "soil_m3", label: "קוב אדמה" },
      ],
    },
    aiInstructionsSuffix:
      "Extract landscaping quantities with botanical and technical precision. For plants: plant_species (Hebrew common name + botanical Latin name if visible), pot_size_liters or height_cm, plant_quantity per species, planting_zone. For areas: lawn_area_m2 (דשא/דשא סינטטי), planting_bed_area_m2, hardscape_area_m2 per material (paving_stone/concrete/gravel), paving_material type and thickness_cm. For irrigation: irrigation_type (טפטוף/ממטרת פופ-אפ/מיקרו), irrigation_pipe_meters by diameter (16mm/20mm/25mm), drip_emitter_count, control_unit_zones_count, filter_and_pressure_reducer (yes/no). Soil: soil_type (גן/שחור/גיר), soil_m3 and compost_m3. Tree staking, mulch_m3 if mentioned. Hardscape items: pergola_m2, planter_wall_m_linear.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / אזור גינון",
      document: "הצעות מחיר, הזמנות צמחיה והשקיה",
      inventory: "צמחים, אבן דריכה ורכיבי השקיה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הצעות, הזמנות חומר ותוכניות גינון",
      recordsLabel: "אישורי ביצוע, אספקה ושלבי חוץ",
      homeTitle: "מרכז תפעול לגינון וחוץ — היקפים, חומרים ואישורים.",
      homeDescription: "מעקב אחר הצעות, אספקה, יומני עבודה וחשבוניות, עם AI שמבין השקיה, צמחייה וריצוף חוץ.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה בשטח", description: "ביצוע, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "LAND_PHASE_APPROVAL",
          label: "אישור שלב גינון / חוץ",
          description: "אישור סיום שלב או אזור.",
          kind: "APPROVAL",
        },
        {
          id: "LAND_SUPPLY_APPROVAL",
          label: "אישור אספקת צמחיה / חומר",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית גינון",
          description: "חיוב רשמי לשלבים או להיקף.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  SUBCONTRACTOR_OTHER: {
    scanner: {
      title: "פענוח מסמכי קבלן משנה",
      subtitle: "הצעות מחיר, חשבוניות ותעודות מהשטח",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק / רכש חומרים", description: "כללי: רכש ציוד, חומרי גלם וכלים" },
        { id: "SUB_QUOTE", label: "הצעת מחיר / כתב כמויות", description: "היקף עבודה, יחידות מידה, מחירי יסוד" },
        { id: "PROGRESS_INVOICE", label: "חשבון חלקי / חשבון סופי", description: "אחוזי ביצוע מתמטברים, ניכוי מקדמות" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח / שקילה", description: "פירוט ציוד שהגיע לאתר או משקל פסולת" },
        { id: "SITE_LOG", label: "יומן עבודה יומי", description: "נוכחות צוותים, שעות טרקטור, אירועים מיוחדים" },
        { id: "APPROVAL_CERT", label: "אישור שלב / טופס איכות", description: "אישור מפקח או יזם לסיום שלב עבודה" }
      ],
      resultColumns: [
        { key: "work_description", label: "תיאור עבודה" },
        { key: "unit", label: "יחידה (מ/מ\"ר/יח'/יום)" },
        { key: "quantity", label: "כמות" },
        { key: "unit_price", label: "מחיר יחידה" },
        { key: "cumulative_percent", label: "% ביצוע מצטבר" },
        { key: "retention_percent", label: "% ניכוי בטחון" },
      ],
    },
    aiInstructionsSuffix:
      "Extract subcontractor billing and BOQ data with financial precision. For each line item: work_description (full Hebrew text), unit (מ/מ\"ר/מ\"ק/יחידה/יום/סל), quantity, unit_price, line_total. For progress invoices: cumulative_billed_percent, current_period_amount, previous_billed_amount, retention_percent and retention_amount, advance_deduction, net_payable. For site logs: crew_count per trade, equipment_list (טרקטור/מנוף/מחפר model if visible), work_done_description, materials_delivered_list, weather_note, safety_incidents (none/description). Always extract: invoice_number, billing_period_dates, project_name, contractor_name, project_manager_name if visible. Distinguish חשבון ביניים vs חשבון סופי.",
    vocabulary: {
      client: "קבלן ראשי / מזמין",
      project: "אתר / תיק משנה",
      document: "הצעות מחיר, חשבוניות ביצוע ודוחות שטח",
      inventory: "חומרים לפי תיקי משנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הצעות מחיר, חשבוניות ביצוע ותעודות שטח",
      recordsLabel: "אישורי התקדמות, אספקה וסגירת שלבים",
      homeTitle: "מרכז תפעול לקבלני משנה — הצעות, ביצוע וחיוב.",
      homeDescription: "ניהול הצעות, חשבוניות התקדמות, יומני שטח ואישורים, עם AI שמבין חוזים משנה ושלבים.",
      templates: [
        { id: "SITE_LOG", label: "יומן דיווח שטח", description: "ביצוע, כוח אדם ומהלך יומי.", kind: "REPORT" },
        {
          id: "SUB_PROGRESS_APPROVAL",
          label: "אישור התקדמות / אחוזים",
          description: "אישור שלב או אחוזי ביצוע.",
          kind: "APPROVAL",
        },
        {
          id: "SUB_QUOTE_ACCEPTANCE",
          label: "אישור קבלה / ניכוי להצעת משנה",
          description: "תיעוד אישור מחיר או שינוי היקף.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית ביצוע / משנה",
          description: "חיוב רשמי לפי שלבים או אחוזים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
};
