# דוגמאות תהליך פרויקט (Excel + גנט)

העתיקו לכאן את קבצי העבודה שלכם לבדיקות ייבוא:

- `quote-roof-template.xlsx` — הצעת מחיר גג (13 גיליונות)
- `account-master-template.xlsx` — חשבון / כתב כמויות (חיים אדלר)
- `leader-gantt.mpp` — MS Project (**אין** ייבוא MPP ישיר באתר — ייצאו מ-Project ל-XML או CSV)
- `leader-gantt.xml` — ייצוא XML מ-Project (מומלץ ל-CI)

API:

- `POST /api/projects/[id]/import/excel` — תצוגה מקדימה / `confirm=true`
- `GET /api/projects/[id]/export/excel?type=quote|account|progress&billNumber=`
- `POST /api/projects/[id]/import/schedule` — XML או CSV
