export interface MessengerMessageEvent {
  id: string,
  command: string,
  data: Object,
  source: string,
  reply: Function
}
