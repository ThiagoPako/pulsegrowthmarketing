// Botão "Falar com a equipe" das páginas públicas: vai para o WhatsApp do Thiago com a mensagem dizendo de onde veio
// (usuário, 02/11/2026: "botão de falar com equipe vai para meu WhatsApp 62985382981 com a mensagem de onde veio").
export const PULSE_WHATSAPP = '5562985382981';

export const pulseWhatsapp = (mensagem: string) => `https://wa.me/${PULSE_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
