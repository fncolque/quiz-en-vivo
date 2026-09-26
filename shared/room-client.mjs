export function connectRoom({ base, code, role, token, onState, onStatus }) {
  let socket,
    timer,
    heartbeat,
    stopped = false,
    attempts = 0;
  function connect() {
    if (stopped) return;
    onStatus(attempts ? "Reconectando…" : "Conectando…");
    socket = new WebSocket(
      base.replace(/^http/, "ws") + `/rooms/${code}/socket`,
    );
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "auth", role, token }));
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, 25000);
    };
    socket.onmessage = (event) => {
      if (event.data === "pong") return;
      const message = JSON.parse(event.data);
      if (message.type === "state") {
        attempts = 0;
        onStatus("En vivo");
        onState(message.state);
      }
    };
    socket.onclose = (event) => {
      clearInterval(heartbeat);
      if (stopped) return;
      if ([4001, 4004].includes(event.code)) {
        onStatus(
          event.code === 4004
            ? "La sala venció."
            : "Acceso interrumpido. Volvé a ingresar.",
        );
        return;
      }
      if (attempts >= 5) {
        onStatus("Sin conexión. Recargá para reintentar.");
        return;
      }
      onStatus("Conexión interrumpida. Conservamos tu respuesta confirmada.");
      timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 12000));
    };
    socket.onerror = () => onStatus("No se pudo conectar. Reintentando…");
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    socket?.close();
  };
}
