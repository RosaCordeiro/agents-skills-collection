import { execFile } from 'node:child_process';
import type { CodigoErro } from '../../core/domain/errors/erro-softdesk';
import type { ILogger } from '../../core/domain/ports/logger';
import type { INotificador } from '../../core/domain/ports/notificador';

/**
 * Balão do Windows (ARCH-001 §8.4, RF-07): `powershell -NoProfile -Command` com um
 * `System.Windows.Forms.NotifyIcon`. Texto fixo por código, sem nenhum dado do chamado nem da
 * pessoa. O limite de um balão por código a cada 10 minutos é do `alerta-contrato`; aqui só se
 * mostra. Nenhuma falha sai daqui: vira `warn` sem a mensagem da exceção.
 */

export interface TextoBalao {
  titulo: string;
  texto: string;
}

/**
 * Sem aspas simples, cifrão nem crase: o texto vai entre aspas simples dentro do script do PowerShell
 * (um teste confere isso).
 */
export const TEXTOS_BALAO: Readonly<Partial<Record<CodigoErro | 'DERIVA', TextoBalao>>> = {
  LAYOUT_LOGIN_MUDOU: {
    titulo: 'SoftDesk Local: o login do SoftDesk mudou',
    texto: 'A tela de login do SoftDesk mudou. Veja o roteiro O SoftDesk mudou no README do softdesk-local.',
  },
  DERIVA: {
    titulo: 'SoftDesk Local: o SoftDesk mudou de formato',
    texto: 'Um campo usado do SoftDesk mudou. Veja o roteiro O SoftDesk mudou no README do softdesk-local.',
  },
  CONTRATO_ROTA_MUDOU: {
    titulo: 'SoftDesk Local: a pesquisa do SoftDesk mudou',
    texto: 'A rota de pesquisa do SoftDesk mudou. Veja o roteiro O SoftDesk mudou no README do softdesk-local.',
  },
};

/** Script que mostra o balão e espera o tempo de ele aparecer antes de liberar o ícone. */
export function montarScriptBalao(balao: TextoBalao): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$n = New-Object System.Windows.Forms.NotifyIcon',
    '$n.Icon = [System.Drawing.SystemIcons]::Warning',
    `$n.BalloonTipTitle = '${balao.titulo}'`,
    `$n.BalloonTipText = '${balao.texto}'`,
    '$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning',
    '$n.Visible = $true',
    '$n.ShowBalloonTip(10000)',
    'Start-Sleep -Seconds 11',
    '$n.Dispose()',
  ].join('; ');
}

/** Executa o PowerShell com o script; os testes trocam por um executor falso. Rejeita em qualquer falha. */
export type ExecutarPowershell = (argumentos: string[]) => Promise<void>;

const executarReal: ExecutarPowershell = (argumentos) =>
  new Promise<void>((resolve, reject) => {
    execFile('powershell.exe', argumentos, { windowsHide: true, timeout: 30_000 }, (erro) =>
      erro ? reject(erro) : resolve(),
    );
  });

export interface OpcoesNotificadorWindows {
  logger: ILogger;
  executar?: ExecutarPowershell;
}

export class NotificadorWindows implements INotificador {
  private readonly executar: ExecutarPowershell;

  constructor(private readonly opcoes: OpcoesNotificadorWindows) {
    this.executar = opcoes.executar ?? executarReal;
  }

  alertar(codigo: CodigoErro | 'DERIVA'): void {
    const balao = TEXTOS_BALAO[codigo];
    if (!balao) return;
    try {
      const pendente = this.executar(['-NoProfile', '-NonInteractive', '-Command', montarScriptBalao(balao)]);
      Promise.resolve(pendente).catch(() => this.avisarFalha(codigo));
    } catch {
      this.avisarFalha(codigo);
    }
  }

  private avisarFalha(codigo: CodigoErro | 'DERIVA'): void {
    try {
      this.opcoes.logger.warn('Não foi possível mostrar o balão do Windows', {
        event: { name: 'notificacao', action: 'balao', outcome: 'failure' },
        codigo_erro: codigo,
      });
    } catch {
      // log nunca derruba nada
    }
  }
}
