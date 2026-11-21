/** Fonte de tempo; os testes trocam por um relógio controlável. */
export interface IRelogio {
  agora(): Date;
}
