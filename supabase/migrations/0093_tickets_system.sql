-- Migration 0093: Hệ Thống Ticket Trợ Giúp Vĩnh Cửu
CREATE TABLE IF NOT EXISTS public.tickets (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'OPEN',
    claimed_by TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_active ON public.tickets(guild_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON public.tickets(channel_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tickets TO service_role;

-- Hàm RPC claim_ticket_atomic chống race-condition khi staff bấm claim cùng lúc
CREATE OR REPLACE FUNCTION public.claim_ticket_atomic(p_channel_id TEXT, p_staff_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.tickets
    SET status = 'CLAIMED', claimed_by = p_staff_id
    WHERE channel_id = p_channel_id AND (status = 'OPEN' OR claimed_by IS NULL);
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_ticket_atomic(TEXT, TEXT) TO service_role;
