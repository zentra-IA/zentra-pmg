export const FGTS_CONFIG = {
  appName: "FGTS CRM",

  sessions: [6, 7, 8, 9, 10],

  defaultSession: 6,

  humanPhone: "5511996289534",

  whatsappServer:
    process.env.NEXT_PUBLIC_WHATSAPP_SERVER ||
    "http://localhost:3001",

  audio: {
    abordagemInicial: "/audios/abordagem.ogg",
  },

  stages: [
    "novo",
    "abordado",
    "respondeu",
    "qualificando",
    "interessado",
    "simulacao",
    "documentacao",
    "contrato",
    "finalizado",
    "sem_interesse",
  ],
}