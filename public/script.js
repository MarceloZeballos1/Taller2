document.addEventListener("DOMContentLoaded", () => {
  const labels = [];
  const dataTemp = [];
  const dataPH = [];
  const MAX_POINTS = 20;

  const ctx = document.getElementById('grafico').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Temperatura (°C)',
          data: dataTemp,
          borderColor: 'blue',
          fill: false,
        },
        {
          label: 'pH',
          data: dataPH,
          borderColor: 'green',
          fill: false,
        }
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    }
  });

  function actualizarValores(dato) {
    document.getElementById('temp').textContent = dato.temp.toFixed(2);
    document.getElementById('ph').textContent = dato.ph.toFixed(2);
    document.getElementById('tds').textContent = dato.tds.toFixed(2);
    document.getElementById('salinidad').textContent = dato.salinidad.toFixed(2);
    document.getElementById('ec').textContent = dato.ec.toFixed(2);
    document.getElementById('resistividad').textContent = dato.resistividad.toFixed(4);
    document.getElementById('pureza').textContent = dato.pureza.toFixed(2);
  }

  async function obtenerDatos() {
  try {
    const res = await fetch('http://192.168.1.8:18570/datos');
    //const res = await fetch('http://192.168.100.60:18570/datos');
    if (!res.ok) throw new Error("Error al obtener datos");
    const datos = await res.json();
    if (datos.length === 0) return;

    const dato = datos[datos.length - 1];
    actualizarValores(dato);

    const timestamp = new Date(dato.fecha).toLocaleTimeString();

    labels.push(timestamp);
    dataTemp.push(dato.temp);
    dataPH.push(dato.ph);

    if (labels.length > MAX_POINTS) {
      labels.shift();
      dataTemp.shift();
      dataPH.shift();
    }

    chart.update();
  } catch (error) {
    console.error('Error al obtener datos:', error);
  }
}


  async function cargarTodosDatos() {
  try {
    const res = await fetch('http://192.168.1.8:18570/datos');
    //const res = await fetch('http://192.168.100.60:18570/datos');
    if (!res.ok) throw new Error("Error al cargar datos completos");
    const datos = await res.json();

    const tablaDatos = document.querySelector("#tablaDatos tbody");
    tablaDatos.innerHTML = "";

    datos.forEach(dato => {
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${new Date(dato.fecha).toLocaleString()}</td>
        <td>${dato.temp.toFixed(2)}</td>
        <td>${dato.ph.toFixed(2)}</td>
        <td>${dato.tds.toFixed(2)}</td>
        <td>${dato.ec.toFixed(2)}</td>
        <td>${dato.resistividad.toFixed(4)}</td>
        <td>${dato.salinidad.toFixed(2)}</td>
        <td>${dato.pureza.toFixed(2)}</td>
      `;
      tablaDatos.appendChild(fila);
    });
  } catch (error) {
    console.error("Error cargando datos:", error);
  }
}


  const formReporte = document.getElementById("formReporte");
  formReporte.addEventListener("submit", async e => {
    e.preventDefault();

    const nombre = document.getElementById("nombre").value.trim();
    const fechaInicio = document.getElementById("fechaInicio").value;
    const horaInicio = document.getElementById("horaInicio").value;
    const fechaFin = document.getElementById("fechaFin").value;
    const horaFin = document.getElementById("horaFin").value;

    if (!nombre || !fechaInicio || !fechaFin) {
      alert("Por favor complete todos los campos.");
      return;
    }

    // Combinar fecha y hora
    const inicio = `${fechaInicio} ${horaInicio}:00`;
    const fin = `${fechaFin} ${horaFin}:00`;

    try {
      const res = await fetch('/reporte/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, inicio, fin }),
      });

      if (!res.ok) {
        let errorMsg = "desconocido";
        try {
          const error = await res.json();
          errorMsg = error.error || errorMsg;
        } catch {
          // No es JSON
        }
        alert("Error al generar reporte: " + errorMsg);
        return;
      }

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/pdf")) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_${fechaInicio}_a_${fechaFin}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert("Respuesta inesperada del servidor");
      }

    } catch (err) {
      alert("Error al solicitar reporte: " + err.message);
    }
  });

  // Ejecutar funciones al cargar la página
  obtenerDatos();
  cargarTodosDatos();

  // Actualizar valores y gráfico cada 3 segundos
  setInterval(obtenerDatos, 3000);
});