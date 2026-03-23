
UPDATE whatsapp_config SET
  msg_recording_scheduled = E'Olá, {nome_cliente}! 🎬\n\nSua gravação foi agendada com sucesso!\n\n📅 Data: {data_gravacao}\n⏰ Horário: {hora_gravacao}\n🎥 Videomaker: {videomaker}\n\n📱 *Acesse sua Área do Cliente para acompanhar tudo:*\n{link_portal}\n\nLá você encontra sua agenda completa, conteúdos e muito mais.\n\nEquipe Pulse Growth Marketing 🚀',

  msg_recording_reminder = E'Olá, {nome_cliente}! 👋\n\nLembrete: sua gravação é amanhã!\n\n⏰ Horário: {hora_gravacao}\n\n📱 *Confirme sua presença acessando o portal:*\n{link_portal}\n\nAcesse a aba Agenda e confirme para que nosso videomaker se desloque até você.\n\nEquipe Pulse Growth Marketing 🚀',

  msg_confirmation = E'Olá, {nome_cliente}! 🚀\n\nPassando para confirmar sua gravação agendada para amanhã.\n\n📅 Data: {data_gravacao}\n⏰ Horário: {hora_gravacao}\n🎥 Videomaker: {videomaker}\n\n📱 *Confirme ou cancele sua gravação no portal:*\n{link_portal}\n\nAcesse a aba Agenda e clique em Confirmar ou Cancelar para que possamos organizar a equipe.\n\nEquipe Pulse Growth Marketing 🚀',

  msg_confirmation_confirmed = E'Perfeito, {nome_cliente}! ✅\n\nSua gravação está confirmada!\n\n📅 {data_gravacao}\n⏰ {hora_gravacao}\n\nNossa equipe estará pronta para criar conteúdos incríveis para sua marca 🎬\n\n📱 Acompanhe tudo na sua Área do Cliente:\n{link_portal}\n\nAté breve!\n\nEquipe Pulse Growth Marketing 🚀',

  msg_confirmation_cancelled = E'Entendido, {nome_cliente}.\n\nSua gravação foi cancelada. Caso queira reagendar, acesse o portal:\n\n📱 {link_portal}\n\nSe surgir uma nova vaga na agenda, entraremos em contato.\n\nEquipe Pulse Growth Marketing',

  msg_backup_invite = E'Olá, {nome_cliente}! 🚀\n\nSurgiu uma vaga extra de gravação na agenda da Pulse!\n\n📅 Data: {data_gravacao}\n⏰ Horário: {hora_gravacao}\n\n📱 *Acesse o portal e confirme a vaga na aba Agenda:*\n{link_portal}\n\nGaranta sua gravação antes que outro cliente confirme!\n\nEquipe Pulse Growth Marketing 🎬',

  msg_backup_confirmed = E'Perfeito, {nome_cliente}! ✅\n\nSua gravação extra foi confirmada!\n\nNossa equipe estará indo até você no horário combinado.\n\n📱 Acompanhe na sua Área do Cliente:\n{link_portal}\n\nEquipe Pulse Growth Marketing 🚀',

  msg_task_editing = E'Olá, {nome_cliente}! 🎬\n\nHoje gravamos o vídeo *"{titulo}"* e ele já está com o nosso time de edição! ✂️\n\nAssim que estiver pronto, enviaremos para sua aprovação na Área do Cliente. 📲\n\n📱 Acesse seu portal para acompanhar o andamento:\n{link_portal}\n\nAgradecemos pela confiança!\n\nEquipe Pulse Growth Marketing 🚀',

  msg_video_approval = E'Olá, {nome_cliente}! 😊\n\nSeu conteúdo *"{titulo}"* ficou pronto e está disponível para aprovação! 🎬\n\n📱 *Acesse sua Área do Cliente Pulse para assistir e aprovar:*\n{link_portal}\n\nLá você pode assistir ao vídeo, aprovar ou solicitar ajustes diretamente.\n\nEquipe Pulse Growth Marketing 🚀',

  msg_video_approved = E'Seu vídeo *"{titulo}"* foi aprovado e será publicado em breve! ✅\n\n📱 Acompanhe o status na sua Área do Cliente:\n{link_portal}\n\nObrigado pela confiança!\n\nEquipe Pulse Growth Marketing 🚀',

  msg_task_approved = E'Olá, {nome_cliente}! ✅\n\nSeu vídeo *"{titulo}"* foi aprovado com sucesso e já está sendo encaminhado para agendamento! 📅\n\n📱 Acompanhe na sua Área do Cliente:\n{link_portal}\n\nObrigado pela confiança!\n\nEquipe Pulse Growth Marketing 🚀',

  msg_approval_expired = E'Olá, {nome_cliente}! 😊\n\nPara manter o fluxo de conteúdos em dia, o vídeo *"{titulo}"* foi encaminhado para agendamento pela nossa equipe.\n\nFique tranquilo(a)! Foi feita uma revisão interna cuidadosa antes de seguir para a postagem. 👍\n\n📱 Acompanhe o status na sua Área do Cliente:\n{link_portal}\n\nSe precisar de algum ajuste, é só nos avisar!\n\nEquipe Pulse Growth Marketing 🚀',

  updated_at = now()
WHERE id IS NOT NULL;
