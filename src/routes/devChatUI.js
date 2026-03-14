import express from "express";

const router = express.Router();

router.get("/chat-ui", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>EVA Training Chat</title>

<style>
body{
  font-family: Arial;
  background:#111;
  color:white;
  padding:40px;
}

#chat{
  max-width:600px;
  margin:auto;
}

.message{
  padding:10px;
  margin:10px 0;
  border-radius:8px;
}

.user{
  background:#2a2a2a;
}

.eva{
  background:#0a3;
}

input{
  width:80%;
  padding:10px;
  font-size:16px;
}

button{
  padding:10px;
  font-size:16px;
}
</style>

</head>

<body>

<div id="chat">

<h2>EVA Training Chat</h2>

<div id="messages"></div>

<input id="input" placeholder="Escribe un mensaje..." />
<button onclick="send()">Enviar</button>

</div>

<script>

async function send(){

  const input = document.getElementById("input");
  const text = input.value;

  if(!text) return;

  addMessage(text,"user");

  input.value="";

  const res = await fetch("/dev/chat",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      message:text
    })
  });

  const data = await res.json();

  addMessage(data.reply || JSON.stringify(data),"eva");

}

function addMessage(text,type){

  const div = document.createElement("div");

  div.className="message "+type;

  div.innerText=text;

  document.getElementById("messages").appendChild(div);

}

</script>

</body>
</html>
`);
});

export default router;
