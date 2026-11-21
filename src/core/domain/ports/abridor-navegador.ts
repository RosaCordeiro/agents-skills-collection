/** Abre o endereço da janela de login no navegador do usuário. Devolve `false` se não conseguiu. */
export interface IAbridorNavegador {
  abrir(url: string): Promise<boolean>;
}
