-- Update 31 orders from broker MC 14273 to MC 114273 (CRST EXPEDITED INC)
UPDATE orders 
SET broker_id = '003dd883-0799-421b-8828-1dd3cbe7f9df' 
WHERE broker_id = 'ef41c800-4991-47a0-a39f-1e6146e7d83d';