import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { promoCampaignTexts, type PromoCampaign, type PromoTicket } from '@/services/promoApi';

interface TicketPrintSheetProps {
  campaign: PromoCampaign;
  tickets: PromoTicket[];
}

/**
 * Folha A4 pronta para impressão: 24 cupons por página (4 colunas x 6 linhas),
 * com linhas de corte pontilhadas e QR Code exclusivo por bilhete.
 */
export default function TicketPrintSheet({ campaign, tickets }: TicketPrintSheetProps) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  // A chamada impressa acompanha o nicho do cliente (abasteceu, comprou, pediu...).
  const callout = promoCampaignTexts(campaign).ticketCallout;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      for (const ticket of tickets) {
        const url = `${window.location.origin}/sorteio/${campaign.slug}/${ticket.token}`;
        entries[ticket.token] = await QRCode.toDataURL(url, { margin: 0, width: 220, errorCorrectionLevel: 'M' });
      }
      if (!cancelled) setQrCodes(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [tickets, campaign.slug]);

  return (
    <div className="promo-print-sheet">
      <style>{`
        .promo-print-sheet { background: #fff; color: #000; }
        .promo-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
        .promo-ticket {
          border: 1px dashed #999;
          padding: 6px;
          text-align: center;
          height: 44mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          break-inside: avoid;
        }
        .promo-ticket h4 { font-size: 8pt; font-weight: 800; margin: 0; text-transform: uppercase; }
        .promo-ticket p { font-size: 5.5pt; margin: 0; line-height: 1.15; }
        .promo-ticket img.qr { width: 20mm; height: 20mm; }
        .promo-ticket .token { font-size: 5pt; letter-spacing: .06em; color: #444; }
        @media print {
          @page { size: A4; margin: 6mm; }
          body * { visibility: hidden; }
          .promo-print-sheet, .promo-print-sheet * { visibility: visible; }
          .promo-print-sheet { position: absolute; inset: 0; }
        }
      `}</style>
      <div className="promo-grid">
        {tickets.map((ticket) => (
          <div className="promo-ticket" key={ticket.id}>
            {campaign.logo_url ? <img src={campaign.logo_url} alt="" style={{ height: '6mm' }} /> : null}
            <h4>Sorteios de Prêmios</h4>
            <p>{callout}</p>
            {qrCodes[ticket.token] ? <img className="qr" src={qrCodes[ticket.token]} alt={ticket.token} /> : <div style={{ height: '20mm' }} />}
            <span className="token">{ticket.token}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
