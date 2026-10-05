import * as React from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '../../lib/ipc';
import './print.css';

export interface Institution {
  name: string; address: string; phone: string; email: string;
  website: string; regNo: string; principalName: string;
}

/** Fetch institution profile once; shared by all print documents. */
export function useInstitution(): Institution | null {
  const [inst, setInst] = React.useState<Institution | null>(null);
  React.useEffect(() => {
    invoke('settings:institution:get', undefined)
      .then((r: any) => setInst({
        name: r.name || 'School Name',
        address: r.address || '',
        phone: r.phone || '',
        email: r.email || '',
        website: r.website || '',
        regNo: r.regNo || '',
        principalName: r.principalName || '',
      }))
      .catch(() => setInst({ name: 'School Name', address: '', phone: '', email: '', website: '', regNo: '', principalName: '' }));
  }, []);
  return inst;
}

/** School letterhead for every printed document. */
export function Letterhead({ inst }: { inst: Institution | null }) {
  if (!inst) return null;
  return (
    <div className="p-letterhead">
      <p className="p-school">{inst.name}</p>
      {inst.address && <p className="p-addr">{inst.address}</p>}
      {(inst.phone || inst.email || inst.website) && (
        <p className="p-addr">{[inst.phone, inst.email, inst.website].filter(Boolean).join(' · ')}</p>
      )}
      {inst.regNo && <p className="p-reg">Reg. No.: {inst.regNo}</p>}
    </div>
  );
}

/** Title bar for a printed document. */
export function DocTitle({ title, docNo, date }: { title: string; docNo?: string; date?: string }) {
  return (
    <div className="p-doctitle">
      <h2>{title}</h2>
      {(docNo || date) && (
        <p className="p-docno">
          {[docNo, date].filter(Boolean).join('  ·  ')}
        </p>
      )}
    </div>
  );
}

/** Key-value meta block (two columns). */
export function MetaBlock({ left, right }: { left: [string, string][]; right?: [string, string][] }) {
  const tbl = (rows: [string, string][]) => (
    <table>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}><td className="p-k">{k}</td><td className="p-v">{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className="p-meta">
      {tbl(left)}
      {right && tbl(right)}
    </div>
  );
}

/** Signature row. */
export function Signatures({ left = 'Receiver', middle = 'Cashier', right = 'Principal' }: { left?: string; middle?: string; right?: string }) {
  return (
    <div className="p-signs">
      {[left, middle, right].map((s) => (
        <div className="p-sign" key={s}>
          <div className="p-line" />
          {s}
        </div>
      ))}
    </div>
  );
}

/** Amount in words helper (Indian numbering). */
export function amountInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`);
  const three = (x: number): string => {
    const h = Math.floor(x / 100); const r = x % 100;
    return `${h ? `${ones[h]} Hundred${r ? ' ' : ''}` : ''}${r ? two(r) : ''}`;
  };
  if (n === 0) return 'Zero';
  let num = Math.floor(Math.abs(n)); let out = '';
  const crore = Math.floor(num / 1e7); num %= 1e7;
  const lakh = Math.floor(num / 1e5); num %= 1e5;
  const thou = Math.floor(num / 1e3); num %= 1e3;
  if (crore) out += `${three(crore)} Crore `;
  if (lakh) out += `${two(lakh)} Lakh `;
  if (thou) out += `${two(thou)} Thousand `;
  if (num) out += three(num);
  return `Rupees ${out.trim()} Only`;
}

/**
 * Wrapper: renders children ONLY in print (hidden on screen).
 * Portaled to document.body (outside #root) so the print CSS can hide
 * the entire app (#root { display:none }) without hiding the document.
 * Place next to the screen preview; the Print button calls window.print().
 */
export function PrintDoc({ children }: { children: React.ReactNode }) {
  const [el] = React.useState(() => {
    const d = document.createElement('div');
    d.className = 'print-doc';
    d.setAttribute('aria-hidden', 'true');
    return d;
  });
  React.useEffect(() => {
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, [el]);
  return createPortal(children, el);
}
