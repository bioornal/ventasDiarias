-- TABLA DE VENTAS
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    amounts JSONB NOT NULL DEFAULT '{}',
    amounts_usd JSONB DEFAULT '{}',
    usd_rate NUMERIC DEFAULT 1000,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA DE CONFIGURACIÓN (Fila única)
CREATE TABLE IF NOT EXISTS config (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::UUID,
    commissions JSONB NOT NULL,
    partners JSONB NOT NULL,
    expenses JSONB NOT NULL,
    usd_rate NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) - Por ahora permitimos todo para facilitar el inicio
-- PERO es recomendable configurar políticas reales más adelante.
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON config FOR ALL USING (true) WITH CHECK (true);
