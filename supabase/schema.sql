-- 소보루 스키마 (Supabase SQL Editor에서 실행)
create extension if not exists vector;

-- 근거 문서: 법령 조문 / 분쟁조정 사례 / FAQ / 금융용어
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('law', 'case', 'faq', 'term')),
  title text not null,
  content text not null,
  source_url text,          -- 출처 원문 링크 (출처 태깅 필수)
  license text,             -- 공공누리 유형 등 라이선스 표시
  -- TODO(임베딩): 임베딩 모델 확정 후 차원 조정 (Voyage 1024 / OpenAI 1536)
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists idx_documents_doc_type on documents (doc_type);

-- 대화 세션·턴 로그 (품질 판정 결과 축적 → PPT의 "측정 데이터"로 활용)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions (id),
  user_message text not null,
  assistant_reply text not null,
  classify jsonb,           -- 문의 유형 + dispreferred 신호
  quality jsonb,            -- 맹검 판정 결과
  repair_triggered boolean default false,
  created_at timestamptz default now()
);

-- TODO(임베딩): pgvector 유사도 검색 함수 (임베딩 적재 후 활성화)
-- create or replace function match_documents(query_embedding vector(1024), match_count int default 5)
-- returns setof documents language sql stable as $$
--   select * from documents
--   where embedding is not null
--   order by embedding <=> query_embedding
--   limit match_count;
-- $$;
