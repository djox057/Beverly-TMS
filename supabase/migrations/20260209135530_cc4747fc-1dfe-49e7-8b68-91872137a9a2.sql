ALTER TABLE public.dispatcher_salary_payments
ADD COLUMN additionals JSONB DEFAULT NULL;

COMMENT ON COLUMN public.dispatcher_salary_payments.additionals IS 'Stores extra pay/charges as JSON array: [{type: "addition"|"charge", reason: string, amount: number}]';