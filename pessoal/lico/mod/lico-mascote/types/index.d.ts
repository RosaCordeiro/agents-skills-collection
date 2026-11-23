export type Humor = 'calmo' | 'trabalhando' | 'feliz' | 'chamando'

declare module 'claude-code' {
  interface PluginState {
    'lico-mascote': {
      roupa: Shaped<string>
      humor: Shaped<Humor>
    }
  }
}
