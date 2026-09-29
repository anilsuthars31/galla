export function Footer() {
  return (
    <footer className="foot">
      <div>
        <b>How it works</b>
        Each narration is decoded for its payment rail (UPI, NEFT, IMPS, NACH, ATM, charges) and payee, then sorted into a category
        by rules. Payments that repeat with a similar amount and date become recurring items. The forecast adds recurring items,
        quarterly items when due, and the recent average of everything else, with income taken at the lower of the recent and
        long-run average.
      </div>
      <div>
        <b>Your data stays here</b>
        The statement is read in this browser and is never uploaded. There is no account and no tracking. Only your category
        choices are remembered, on this device.
      </div>
      <div>
        <b>Supported files</b>
        CSV or Excel (XLS, XLSX) exports from net banking with columns for date, narration, withdrawal and deposit (or one amount
        column with Dr/Cr), and optionally the balance. PDF statements are not read yet: download the Excel version instead.
      </div>
    </footer>
  );
}
