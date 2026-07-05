# מודל נתונים — ER Diagram

> נוצר אוטומטית מ-[`prisma/schema.prisma`](../prisma/schema.prisma) ע"י
> `node scripts/generate-erd.mjs`. אל תערוך ידנית — הרץ מחדש אחרי שינוי סכמה.
> 68 מודלים.

```mermaid
erDiagram
  Organization {
    String id PK
    String name
    DateTime createdAt
    String stripeCustomerId UK
    String subscriptionStatus
    String stripeSubscriptionId
    DateTime trialEndsAt
    String address
    String taxId
    Boolean isReportable
    Float vatRatePercent
    Boolean calendarGoogleEnabled
  }
  DocumentDraft {
    String id PK
    String organizationId
    String userId
    String docType
  }
  MeckanoZone {
    String id PK
    String name
    String organizationId
    Boolean isActive
    Boolean syncedToCrm
    DateTime createdAt
    DateTime updatedAt
    String address
    Int assignedEmployeeIds
    Float budgetHours
    String description
    DateTime endDate
  }
  OrganizationInvite {
    String id PK
    String token UK
    String email
    String organizationId
    DateTime expiresAt
    DateTime usedAt
    DateTime createdAt
    String createdByEmail
  }
  OSBillingConfig {
    String id PK
  }
  ScanBundle {
    String id PK
    String slug UK
    String name
    String description
    Float priceIls
    Int cheapAdds
    Int premiumAdds
    Boolean isActive
    Int sortOrder
    DateTime createdAt
    DateTime updatedAt
  }
  SubscriptionInvitation {
    String id PK
    String token UK
    String email
    DateTime expiresAt
    DateTime usedAt
    DateTime createdAt
    String createdByEmail
  }
  Project {
    String id PK
    String name
    String organizationId
    DateTime createdAt
    DateTime updatedAt
    String status
    String primaryContactId
    Boolean autoSyncCrm
    DateTime activeFrom
    DateTime activeTo
    Boolean isActive
    Float budget
  }
  Task {
    String id PK
    String title
    String description
    String status
    String priority
    DateTime dueDate
    DateTime startDate
    DateTime endDate
    Int progress
    String dependencies
    String parentTaskId
    String externalTaskId
  }
  WorkDiary {
    String id PK
    String projectId
    String organizationId
    DateTime date
    Int workersCount
    String description
    Int progress
    Boolean isSyncedToAI
    String createdByUserId
    String weather
    Float workHours
    Json materialsJson
  }
  ProjectQuote {
    String id PK
    String projectId
    String organizationId
    Int version
    String title
    String status
    String sourceFileName
    Float totalAmount
    DateTime createdAt
    DateTime updatedAt
  }
  ProjectBoqLine {
    String id PK
    String projectId
    String organizationId
    String quoteId
    Int sortOrder
    String sectionTitle
    String description
    String unit
    Float quantity
    Float unitPrice
    Float lineTotal
    Boolean isSectionSubtotal
  }
  ProjectBoqPhaseColumn {
    String id PK
    String boqLineId
    Int phaseIndex
    Float coefficient
    Float phaseAmount
  }
  ProgressBill {
    String id PK
    String projectId
    String organizationId
    Int billNumber
    DateTime billDate
    Float subtotal
    Float discountPercent
    Float vatPercent
    Json adjustmentsJson
    Float total
    String status
    String contractorName
  }
  ContextComment {
    String id PK
    String organizationId
    String targetType
    String targetId
    String authorUserId
    String text
    DateTime createdAt
    DateTime updatedAt
  }
  ProgressBillLine {
    String id PK
    String billId
    String boqLineId
    String description
    Float contractQty
    Float unitPrice
    Float executedQty
    Float executedCoef
    Float lineTotal
  }
  PushSubscription {
    String id PK
    String userId
    String endpoint UK
    String p256dh
    String auth
    String userAgent
    DateTime createdAt
  }
  PaymentMilestone {
    String id PK
    String projectId
    String organizationId
    String name
    Float amount
    Float percent
    Boolean isPaid
    DateTime datePaid
    Int sortOrder
    DateTime createdAt
  }
  ProjectExtra {
    String id PK
    String projectId
    String organizationId
    String description
    Float cost
    Boolean isApproved
    DateTime createdAt
  }
  ProjectExpense {
    String id PK
    String projectId
    String organizationId
    String month
    String category
    Float amount
    DateTime createdAt
  }
  User {
    String id PK
    String email UK
    String name
    DateTime createdAt
    String organizationId
    DateTime emailVerified
    String image
    String passwordHash
    DateTime lastLoginAt
    DateTime scanHistoryClearedAt
    Json launcherConfigJson
    Json workspaceLayoutJson
  }
  UserPasskey {
    String id PK
    String userId
    String credentialId UK
    Bytes publicKey
    BigInt counter
    String deviceName
    DateTime createdAt
    DateTime lastUsedAt
  }
  PasswordResetToken {
    String id PK
    String userId
    String tokenHash UK
    DateTime expiresAt
    DateTime createdAt
  }
  InAppNotification {
    String id PK
    String userId
    String title
    String body
    Boolean read
    String linkType
    String targetId
    Json metadata
    DateTime createdAt
  }
  Notebook {
    String id PK
    String userId
    String organizationId
    String projectId
    String title
    DateTime createdAt
    DateTime updatedAt
  }
  NotebookSource {
    String id PK
    String notebookId
    String name
    String content
    String mimeType
    Int sortOrder
  }
  NotebookMessage {
    String id PK
    String notebookId
    String role
    String content
    DateTime createdAt
  }
  NotebookAudioOverview {
    String id PK
    String notebookId UK
    String scriptText
    DateTime createdAt
  }
  CloudIntegration {
    String id PK
    String organizationId
    String displayName
    String accessToken
    String refreshToken
    DateTime tokenExpiresAt
    Boolean autoScan
    Boolean backupExports
    String folderPath
    String driveFolderId
    String driveFolderName
    Boolean driveSyncEnabled
  }
  DriveSyncEntry {
    String id PK
    String organizationId
    String driveFileId
    String parentDriveId
    String name
    String mimeType
    String md5Checksum
    DateTime modifiedTime
    String webViewLink
    Boolean trashed
    String decodeError
    String linkedDocumentId
  }
  KnowledgeVaultChunk {
    String id PK
    String organizationId
    String driveEntryId
    Int chunkIndex
    String content
    Json embedding
    String textHash
    DateTime updatedAt
  }
  Account {
    String id PK
    String userId
    String type
    String provider
    String providerAccountId
    String refresh_token
    String access_token
    Int expires_at
    String token_type
    String scope
    String id_token
    String session_state
  }
  Session {
    String id PK
    String sessionToken UK
    String userId
    DateTime expires
  }
  VerificationToken {
    String identifier
    String token UK
    DateTime expires
  }
  Contact {
    String id PK
    String name
    String email
    String status
    String organizationId
    DateTime createdAt
    String projectId
    String notes
    String phone
    Float value
    String tags
  }
  ContactSearchEmbedding {
    String id PK
    String organizationId
    String contactId UK
    String textHash
    Json embedding
    DateTime updatedAt
  }
  FinancialInsight {
    String id PK
    String organizationId UK
    String content
    DateTime updatedAt
  }
  IssuedDocument {
    String id PK
    Int number
    DateTime date
    DateTime dueDate
    String clientName
    Float amount
    Float vat
    Float total
    String itaAllocationNumber
    DateTime lastReminderAt
    Int reminderCount
  }
  ExpenseRecord {
    String id PK
    String organizationId
    String vendorName
    String invoiceNumber
    DateTime expenseDate
    String description
    Float amountNet
    Float vat
    Float total
    String projectId
    String contactId
    String sourceDocumentId
  }
  Invoice {
    String id PK
    String organizationId
    String status
    Float amount
    String currency
    String payplusTransactionId UK
    DateTime paidAt
    Json lastWebhookPayload
    DateTime createdAt
    DateTime updatedAt
    String customerEmail
    String customerName
  }
  Quote {
    String id PK
    String token UK
    Float amount
    String signatureBase64
    String status
    String contactId
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  DocumentScanJob {
    String id PK
    String fileData
    Json result
    String error
    String userId
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  Document {
    String id PK
    String fileName
    String type
    String status
    Json aiData
    String fileDriveId
    String fileDriveWebViewLink
    String userId
    String organizationId
    DateTime createdAt
    DateTime deletedAt
  }
  DocumentScanCache {
    String id PK
    String organizationId
    String contentSha256
    String providerUsed
    String locale
    Int schemaVersion
    Json resultJson
    DateTime createdAt
    DateTime updatedAt
  }
  DocumentLineItem {
    String id PK
    String documentId
    String organizationId
    String supplierName
    String description
    String normalizedKey
    Float quantity
    Float unitPrice
    Float lineTotal
    String currency
    String sku
    DateTime createdAt
  }
  ProductPriceObservation {
    String id PK
    String organizationId
    String documentId
    String normalizedKey
    String description
    String supplierName
    Float unitPrice
    String currency
    DateTime observedAt
  }
  ActivityLog {
    String id PK
    String action
    String details
    String userId
    String organizationId
    DateTime createdAt
  }
  RateLimit {
    String id PK
    String key UK
    Int count
    DateTime resetAt
    DateTime createdAt
    DateTime updatedAt
  }
  Automation {
    String id PK
    String organizationId
    String name
    String description
    Boolean enabled
    String triggerType
    String triggerValue
    String actionType
    Json actionConfig
  }
  AutomationRun {
    String id PK
    String automationId
    String entityId
    String entityType
    String status
    String errorMessage
    DateTime createdAt
  }
  Setting {
    String id PK
    String key UK
    String value
    String group
    DateTime createdAt
    DateTime updatedAt
  }
  EmailDigestItem {
    String id PK
    String recipient
    String category
    String title
    String body
    DateTime createdAt
  }
  AICorrection {
    String id PK
    String organizationId
    String documentId
    Json originalAiData
    Json correctedData
    String correctionSource
    DateTime createdAt
  }
  PlatformSettings {
    String id PK
    Json configJson
    DateTime updatedAt
  }
  FieldCopilotSession {
    String id PK
    String organizationId
    String userId
    String contactId
    String projectId
    String contactName
    String projectName
    String constructionTrade
    String transcript
    String userNotes
    String videoAssetId
    Json analysisJson
  }
  UserGoogleCalendarSettings {
    String id PK
    String userId
    String organizationId
    Boolean enabled
    DateTime consentAt
    String consentVersion
    String calendarId
    String calendarSummary
    String calendarColor
    String syncToken
    DateTime lastSyncAt
    String lastSyncError
  }
  GoogleCalendarEventLink {
    String id PK
    String userId
    String organizationId
    String googleCalendarId
    String googleEventId
    String googleEtag
    String taskId
    String summary
    DateTime startAt
    DateTime endAt
    Boolean allDay
    String htmlLink
  }
  FieldCopilotAsset {
    String id PK
    String sessionId
    String organizationId
    String mimeType
    String kind
    String dataBase64
    String driveFileId
    String driveWebViewLink
    String driveFolderId
    String driveArchiveStatus
    String driveError
    DateTime createdAt
  }
  CustomAppSchema {
    String id PK
    String organizationId
    String name
    String description
    Json uiSchema
    String jsxCode
    Boolean isGlobal
    DateTime createdAt
    DateTime updatedAt
  }
  CustomAppData {
    String id PK
    String organizationId
    String schemaId
    Json data
    DateTime createdAt
    DateTime updatedAt
  }
  AppIdeaSubmission {
    String id PK
    Json uiSchema
    String appName
    String appType
    String status
    String orgIndustry
    DateTime createdAt
  }
  InventoryItem {
    String id PK
    String name
    String sku
    String category
    Float quantity
    Float minQuantity
    String unit
    String location
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  Asset {
    String id PK
    String name
    String serialNumber
    String type
    String currentUserId
    String projectId
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  AssetCheckoutLog {
    String id PK
    String assetId
    String organizationId
    String userId
    String projectId
    String action
    String notes
    DateTime createdAt
  }
  Supplier {
    String id PK
    String name
    String contactPerson
    String email
    String phone
    String taxId
    String paymentTerms
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseRequest {
    String id PK
    String title
    String status
    String source
    String notes
    Float quantityNeeded
    String projectId
    String inventoryItemId
    String organizationId
    DateTime createdAt
    DateTime updatedAt
  }
  PurchaseOrder {
    String id PK
    String orderNumber
    String status
    Float totalAmount
    String currency
    DateTime expectedDate
    String notes
    String supplierId
    String projectId
    String issuedDocumentId
    String organizationId
    DateTime createdAt
  }
  PurchaseOrderLine {
    String id PK
    String description
    Float quantity
    Float unitPrice
    Float totalPrice
    Float receivedQty
    String inventoryItemId
    String purchaseOrderId
  }
  MeckanoZone }o-- : ""
  MeckanoZone  : ""
  OrganizationInvite }o-- : ""
  WorkDiary }o-- : ""
  WorkDiary }o-- : ""
  ProjectQuote }o-- : ""
  ProjectQuote }o-- : ""
  ProjectQuote  : ""
  ProjectBoqLine }o-- : ""
  ProjectBoqLine }o-- : ""
  ProjectBoqLine  : ""
  ProjectBoqLine  : ""
  ProgressBill }o-- : ""
  ProgressBill }o-- : ""
  ProgressBill  : ""
  ContextComment }o-- : ""
  ContextComment }o-- : ""
  PushSubscription }o-- : ""
  PaymentMilestone }o-- : ""
  PaymentMilestone }o-- : ""
  ProjectExtra }o-- : ""
  ProjectExtra }o-- : ""
  ProjectExpense }o-- : ""
  ProjectExpense }o-- : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User  : ""
  User }o-- : ""
  Notebook }o-- : ""
  Notebook }o-- : ""
  Notebook  : ""
  Notebook  : ""
  Notebook }o-- : ""
  DriveSyncEntry }o-- : ""
  DriveSyncEntry  : ""
  KnowledgeVaultChunk }o-- : ""
  Contact }o-- : ""
  Contact }o-- : ""
  Contact  : ""
  Contact  : ""
  Contact  : ""
  Contact }o-- : ""
  ContactSearchEmbedding }o-- : ""
  FinancialInsight }o-- : ""
  ExpenseRecord }o-- : ""
  ExpenseRecord }o-- : ""
  ExpenseRecord }o-- : ""
  Invoice }o-- : ""
  Quote }o-- : ""
  DocumentScanJob }o-- : ""
  Document }o-- : ""
  Document  : ""
  Document  : ""
  DocumentScanCache }o-- : ""
  DocumentLineItem }o-- : ""
  ProductPriceObservation }o-- : ""
  ActivityLog }o-- : ""
  AutomationRun }o-- : ""
  AICorrection }o-- : ""
  FieldCopilotSession }o-- : ""
  FieldCopilotSession  : ""
  UserGoogleCalendarSettings }o-- : ""
  GoogleCalendarEventLink }o-- : ""
  GoogleCalendarEventLink }o-- : ""
  CustomAppSchema }o-- : ""
  CustomAppSchema  : ""
  CustomAppData }o-- : ""
  InventoryItem }o-- : ""
  InventoryItem  : ""
  InventoryItem  : ""
  Asset }o-- : ""
  Asset }o-- : ""
  Asset  : ""
  Supplier }o-- : ""
  Supplier  : ""
  PurchaseRequest }o-- : ""
  PurchaseRequest }o-- : ""
  PurchaseOrder }o-- : ""
  PurchaseOrder }o-- : ""
  PurchaseOrder }o-- : ""
  PurchaseOrder  : ""
```

## מיגרציות

- יצירה: SQL ב-`prisma/migrations/` (Neon — ללא shadow DB).
- הפעלה מקומית: `npm run db:migrate`.
