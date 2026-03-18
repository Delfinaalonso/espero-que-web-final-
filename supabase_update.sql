-- Agregar columnas para campos estructurados del admin
-- Ejecutar en Supabase → SQL Editor

alter table products
  add column if not exists benefits jsonb,
  add column if not exists ingredients jsonb,
  add column if not exists ideal_for jsonb,
  add column if not exists faq jsonb,
  add column if not exists supplement_facts text,
  add column if not exists dosage_amount text,
  add column if not exists dosage_when text,
  add column if not exists dosage_how text;
