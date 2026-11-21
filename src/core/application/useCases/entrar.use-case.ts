import { ErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { IJanelaLogin } from '../../domain/ports/janela-login';
import type { ISessaoStore } from '../../domain/ports/sessao.store';
import type { EstadoSessaoDto, EstadoSessaoUseCase } from './estado-sessao.use-case';

/**
 * RF-01 (ARCH-001 §6 F1): com sessão válida devolve o estado, sem abrir janela e sem chamar o
 * SoftDesk; senão abre ou reaproveita a janela e espera até `esperaMs` (a espera é de quem chamou,
 * a vida de 5 min é da janela). Estourar a espera devolve `AGUARDANDO_LOGIN` com a janela aberta.
 */
export class EntrarUseCase {
  constructor(
    private readonly sessao: ISessaoStore,
    private readonly janela: IJanelaLogin,
    private readonly estado: EstadoSessaoUseCase,
    private readonly esperaMs: number,
  ) {}

  async executar(): Promise<EstadoSessaoDto> {
    if (this.sessao.estado() === 'AUTENTICADA') return this.estado.executar();
    await this.janela.abrirOuReaproveitar();
    const r = await this.janela.aguardarResultado(this.esperaMs);
    if (r === 'TEMPO') {
      throw new ErroSoftdesk('AGUARDANDO_LOGIN', { janela: { aberta: this.janela.info() !== null } });
    }
    if (!r.ok) throw r.erro;
    return this.estado.executar();
  }
}
