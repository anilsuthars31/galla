/* Anonymized narration samples per bank style: [narration, direction, rail, payee, category].
   No account numbers, phone numbers or full personal VPAs. */
import type { CategoryId, Direction, Rail } from '../../src/engine/types';

export type NarrationCase = [narration: string, dir: Direction, rail: Rail, payee: string, category: CategoryId | null];

export const NARRATIONS: Record<string, NarrationCase[]> = {
  hdfc: [
    ['UPI-XXXX-xxxx@okicici-HDFC0000001-612312345678-PAYMENT FROM PH', 'C', 'UPI', 'Xxxx', 'sales'],
    ['NEFT CR-YESB0000001-BHARATPE SETTLEMENT-SHOP-N12345', 'C', 'NEFT', 'Bharatpe Settlement', 'sales'],
    ['POS 416021XXXXXX1234 METRO CASH AND CARRY', 'D', 'Card', 'Pos Metro Cash And Carry', 'suppliers'],
    ['NEFT DR-HDFC0001432-SHREE GANESH DISTRIBUTORS-N123456', 'D', 'NEFT', 'Shree Ganesh Distributors', 'suppliers'],
  ],
  sbi: [
    ['BY TRANSFER-UPI/CR/610112345678/xxxx@okaxis/Payment', 'C', 'UPI', 'xxxx', 'sales'],
    ['TO TRANSFER-UPI/DR/610298765432/AGARWAL TRADERS/xxxx@okhdfcbank/Stock', 'D', 'UPI', 'Agarwal Traders', 'suppliers'],
    ['ATM WDL/ATM SBI KOTHRUD/123456', 'D', 'ATM', 'ATM withdrawal', 'other'],
    ['CBDT ADV TAX CHALLAN 280/12345678', 'D', 'Other', 'Advance tax', 'tax'],
  ],
  icici: [
    ['BIL/BPAY/000123/BESCOM ELECTRICITY', 'D', 'Other', 'Bil', 'utilities'],
    ['ACH/BAJAJ FINANCE LTD/EMI0012', 'D', 'NACH', 'Bajaj Finance', 'emi'],
    ['NEFT-XXXX0000001-RAZORPAY SETTLEMENT-N12345', 'C', 'NEFT', 'Razorpay Settlement', 'sales'],
  ],
  axis: [
    ['UPI/P2M/612345678901/PAYTM SETTLEMENT/Sales', 'C', 'UPI', 'Paytm Settlement', 'sales'],
    ['IMPS/P2A/612399998888/SHREE WHOLESALE MART/Stock', 'D', 'IMPS', 'Shree Wholesale Mart', 'suppliers'],
    ['CONSOLIDATED CHARGES FOR A/C', 'D', 'Charge', 'Bank charges', 'charges'],
  ],
  kotak: [
    ['UPI/SETTLEMENT/PHONEPE/xxxx@ybl', 'C', 'UPI', 'Settlement', 'sales'],
    ['NEFT RENT SHOP APRIL', 'D', 'NEFT', 'Rent Shop April', 'rent'],
    ['CASH DEP KORAMANGALA', 'C', 'Cash', 'Cash deposit', 'sales'],
  ],
  generic: [
    ['UPI/CR/717889', 'C', 'UPI', 'Unnamed UPI payment', 'sales'],
    ['UPI/CR', 'C', 'UPI', 'Unnamed UPI payment', 'sales'],
    ['POS SETTLE', 'C', 'Card', 'Pos Settle', 'sales'],
    ['GST PAYMENT CPIN 2604123/GSTN', 'D', 'Other', 'GST payment', 'tax'],
    ['SMS ALERT CHRG JUL-SEP26', 'D', 'Charge', 'Bank charges', 'charges'],
    ['INT.PD:01-04-2026 TO 30-06-2026', 'C', 'Interest', 'Bank interest', 'other_income'],
    ['UPI/DR/123/ZOMATO/zomato.order@hdfcbank/Order', 'D', 'UPI', 'Zomato', 'personal'],
    ['UPI/ramesh@upi', 'C', 'UPI', 'ramesh', 'sales'],
    ['UPI/ramesh@upi', 'D', 'UPI', 'ramesh', null],
  ],
};
