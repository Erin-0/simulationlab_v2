-- ================================================================
-- MUR DES CROQUIS — table + sécurité RLS (Supabase)
-- À coller dans : Dashboard → SQL Editor → New query → Run
-- ================================================================

create table if not exists public.wall_strokes (
  id          bigint generated always as identity primary key,
  wall        text        not null default 'main',   -- un mur partageable a son identifiant
  player_id   uuid        not null,                  -- uuid anonyme (ou local)
  player_name text,                                  -- pseudo optionnel (signature)
  color       text        not null,                  -- '#dc2626' ou couleur de fond = gomme
  size        real        not null default 6,        -- épaisseur du trait (px texture)
  points      jsonb       not null,                  -- [u0,v0,u1,v1,...] normalisés 0..1
  created_at  timestamptz not null default now()
);

create index if not exists wall_strokes_wall_id_idx
  on public.wall_strokes (wall, id);

alter table public.wall_strokes enable row level security;

-- ================================================================
-- VARIANTE A (recommandée) — Authentification ANONYME
-- Prérequis : Dashboard → Authentication → Sign In / Providers
--             → « Anonymous sign-ins » : ON
-- Chaque navigateur reçoit un uuid stable sans aucun formulaire.
-- ================================================================
drop policy if exists "mur_lecture"   on public.wall_strokes;
drop policy if exists "mur_insertion" on public.wall_strokes;

create policy "mur_lecture"
  on public.wall_strokes for select
  using (true);

create policy "mur_insertion"
  on public.wall_strokes for insert
  with check (auth.uid() = player_id);

-- ================================================================
-- VARIANTE B — SANS aucune authentification (encore plus simple)
-- Si vous préférez ne pas activer les anonymous sign-ins :
--   1. commentez les DEUX policies « create policy » de la variante A,
--   2. décommentez les deux lignes ci-dessous, puis relancez.
-- NB : n'importe qui possédant la clé anon pourra alors écrire —
-- acceptable pour un TP de classe, pas pour un site public ouvert.
-- ================================================================
-- drop policy if exists "mur_lecture"   on public.wall_strokes;
-- drop policy if exists "mur_insertion" on public.wall_strokes;
-- create policy "mur_lecture"   on public.wall_strokes for select using (true);
-- create policy "mur_insertion" on public.wall_strokes for insert with check (true);

-- ================================================================
-- (Optionnel, plus tard) Temps réel Supabase — INUTILE tant qu'on
-- reste sur le polling toutes les 10 s. Une ligne suffit si un jour
-- vous voulez la synchro instantanée côté client :
-- ================================================================
-- alter publication supabase_realtime add table public.wall_strokes;
