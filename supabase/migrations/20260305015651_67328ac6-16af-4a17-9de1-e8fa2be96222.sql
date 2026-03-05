
ALTER TABLE public.whatsapp_config 
  ADD COLUMN api_token text NOT NULL DEFAULT '',
  ADD COLUMN msg_recording_scheduled text NOT NULL DEFAULT 'Olá! Sua gravação foi agendada.

Cliente: {nome_cliente}
Data: {data_gravacao}
Horário: {hora_gravacao}
Videomaker: {videomaker}

Equipe Pulse Growth Marketing',
  ADD COLUMN msg_recording_reminder text NOT NULL DEFAULT 'Lembrete da sua gravação amanhã.

Cliente: {nome_cliente}
Horário: {hora_gravacao}

Equipe Pulse Growth Marketing',
  ADD COLUMN msg_video_approval text NOT NULL DEFAULT 'Seu vídeo está pronto para aprovação.

Acesse o link abaixo para assistir:
{link_video}

Se precisar de ajustes nos avise.

Equipe Pulse Growth Marketing',
  ADD COLUMN msg_video_approved text NOT NULL DEFAULT 'Seu vídeo foi aprovado e será publicado em breve.

Obrigado pela confiança na Pulse Growth Marketing.';
