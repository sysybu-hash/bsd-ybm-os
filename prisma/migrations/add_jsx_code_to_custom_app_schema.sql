-- Migration: add jsxCode column to CustomAppSchema
-- שומר את קוד ה-JSX שנוצר על ידי ה-AI כדי לאפשר טעינה מחדש של תצוגה מקדימה

ALTER TABLE "CustomAppSchema" ADD COLUMN IF NOT EXISTS "jsxCode" TEXT;
