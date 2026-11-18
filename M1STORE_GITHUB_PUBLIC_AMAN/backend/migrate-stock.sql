USE m1store;
-- Jalankan sekali pada database lama, jangan jalankan dua kali.
ALTER TABLE products ADD COLUMN stock INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
