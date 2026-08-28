--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3 (Debian 16.3-1.pgdg120+1)
-- Dumped by pg_dump version 16.3 (Debian 16.3-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AlertType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AlertType" AS ENUM (
    'darknet',
    'group',
    'country'
);


ALTER TYPE public."AlertType" OWNER TO postgres;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

--
-- Name: UserProvider; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserProvider" AS ENUM (
    'postgres',
    'ldap'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Alert; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Alert" (
    id text NOT NULL,
    keyword text NOT NULL,
    type public."AlertType" NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    "htmlMessage" text DEFAULT ''::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    "newHits" integer DEFAULT 1 NOT NULL,
    "timeRange" BIGINT DEFAULT 0 NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Alert" OWNER TO postgres;

--
-- Name: AlertKeyword; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AlertKeyword" (
    keyword text DEFAULT ''::text NOT NULL,
    type public."AlertType" DEFAULT 'darknet'::public."AlertType" NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."AlertKeyword" OWNER TO postgres;

--
-- Name: KeywordSubscription; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."KeywordSubscription" (
    id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "userId" integer NOT NULL,
    keyword text NOT NULL,
    type public."AlertType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."KeywordSubscription" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    password text DEFAULT ''::text NOT NULL,
    "twoFactorSecret" text,
    role public."UserRole" DEFAULT 'user'::public."UserRole" NOT NULL,
    provider public."UserProvider" DEFAULT 'postgres'::public."UserProvider" NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    settings jsonb DEFAULT '{"emailAlerts": true, "alertFrequency": "realtime"}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_id_seq" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Name: AlertKeyword AlertKeyword_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AlertKeyword"
    ADD CONSTRAINT "AlertKeyword_pkey" PRIMARY KEY (keyword, type);


--
-- Name: Alert Alert_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Alert"
    ADD CONSTRAINT "Alert_pkey" PRIMARY KEY (id);


--
-- Name: KeywordSubscription KeywordSubscription_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."KeywordSubscription"
    ADD CONSTRAINT "KeywordSubscription_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: AlertKeyword_keyword_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "AlertKeyword_keyword_key" ON public."AlertKeyword" USING btree (keyword);


--
-- Name: AlertKeyword_keyword_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AlertKeyword_keyword_type_idx" ON public."AlertKeyword" USING btree (keyword, type);


--
-- Name: Alert_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Alert_id_key" ON public."Alert" USING btree (id);


--
-- Name: Alert_keyword_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Alert_keyword_type_idx" ON public."Alert" USING btree (keyword, type);


--
-- Name: Alert_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Alert_userId_idx" ON public."Alert" USING btree ("userId");


--
-- Name: KeywordSubscription_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "KeywordSubscription_id_key" ON public."KeywordSubscription" USING btree (id);


--
-- Name: KeywordSubscription_keyword_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "KeywordSubscription_keyword_type_idx" ON public."KeywordSubscription" USING btree (keyword, type);


--
-- Name: KeywordSubscription_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "KeywordSubscription_userId_idx" ON public."KeywordSubscription" USING btree ("userId");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_id_key" ON public."User" USING btree (id);


--
-- Name: User_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_name_key" ON public."User" USING btree (name);


--
-- PostgreSQL database dump complete
--

--- Insert default user

INSERT INTO public."User" ("name", "email", "password", "role")
VALUES (
    'EACTDA Ranssomware Admin',
    'eactda@byronlabs.io',
    '$2a$12$08HaAFkfOwdY6PgqgBc8.epWldWgyNSS4QCcvZDn2o95RlK6aAGtC', -- Admin!1234%
    'admin'
);

Select * from public."User";
