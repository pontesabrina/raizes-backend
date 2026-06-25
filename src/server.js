const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "API Raízes do Nordeste rodando!" });
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        error: "DADOS_INVALIDOS",
        message: "Email e senha são obrigatórios."
      });
    }

    const usuario = await prisma.user.findUnique({
      where: { email }
    });

    if (!usuario) {
      return res.status(401).json({
        error: "CREDENCIAIS_INVALIDAS",
        message: "Email ou senha inválidos."
      });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);

    if (!senhaValida) {
      return res.status(401).json({
        error: "CREDENCIAIS_INVALIDAS",
        message: "Email ou senha inválidos."
      });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        role: usuario.role
      },
      "segredo-do-projeto",
      { expiresIn: "1h" }
    );

    res.json({
      accessToken: token,
      tokenType: "Bearer",
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao realizar login."
    });
  }
});

app.post("/usuarios", async (req, res) => {
  try {
    const { nome, email, senha, role } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        error: "DADOS_INVALIDOS",
        message: "Nome, email e senha são obrigatórios."
      });
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const usuario = await prisma.user.create({
      data: {
        nome,
        email,
        senha: senhaCriptografada,
        role: role || "CLIENTE"
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true
      }
    });

    return res.status(201).json(usuario);
  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao criar usuário."
    });
  }
});

app.get("/usuarios", async (req, res) => {
  const usuarios = await prisma.user.findMany({
    select: {
      id: true,
      nome: true,
      email: true,
      role: true
    }
  });

  res.json(usuarios);
});

app.post("/produtos", async (req, res) => {
  try {
    const { nome, descricao, preco } = req.body;

    if (!nome || !descricao || preco === undefined) {
      return res.status(400).json({
        error: "DADOS_INVALIDOS",
        message: "Nome, descrição e preço são obrigatórios."
      });
    }

    if (preco <= 0) {
      return res.status(422).json({
        error: "PRECO_INVALIDO",
        message: "O preço deve ser maior que zero."
      });
    }

    const produto = await prisma.produto.create({
      data: {
        nome,
        descricao,
        preco
      }
    });

    return res.status(201).json(produto);
  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao criar produto."
    });
  }
});

app.get("/produtos", async (req, res) => {
  const produtos = await prisma.produto.findMany({
    where: {
      ativo: true
    }
  });

  res.json(produtos);
});

app.post("/pedidos", async (req, res) => {
  try {
    const { usuarioId, itens } = req.body;

    if (!usuarioId || !itens || itens.length === 0) {
      return res.status(400).json({
        error: "DADOS_INVALIDOS",
        message: "Usuário e itens do pedido são obrigatórios."
      });
    }

    let valorTotal = 0;
    const itensCalculados = [];

    for (const item of itens) {
      const produto = await prisma.produto.findUnique({
        where: { id: item.produtoId }
      });

      if (!produto) {
        return res.status(404).json({
          error: "PRODUTO_NAO_ENCONTRADO",
          message: `Produto ${item.produtoId} não encontrado.`
        });
      }

      if (item.quantidade <= 0) {
        return res.status(422).json({
          error: "QUANTIDADE_INVALIDA",
          message: "A quantidade deve ser maior que zero."
        });
      }

      valorTotal += produto.preco * item.quantidade;

      itensCalculados.push({
        produtoId: produto.id,
        quantidade: item.quantidade,
        precoUnitario: produto.preco
      });
    }

    const pedido = await prisma.pedido.create({
      data: {
        usuarioId,
        valorTotal,
        itens: {
          create: itensCalculados
        }
      },
      include: {
        itens: {
          include: {
            produto: true
          }
        },
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            role: true
          }
        }
      }
    });

    return res.status(201).json(pedido);

  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao criar pedido."
    });
  }
});

app.post("/pagamentos/mock", async (req, res) => {
  try {
    const { pedidoId, aprovado } = req.body;

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId }
    });

    if (!pedido) {
      return res.status(404).json({
        error: "PEDIDO_NAO_ENCONTRADO",
        message: "Pedido não encontrado."
      });
    }

    const novoStatus = aprovado ? "PAGO" : "PAGAMENTO_RECUSADO";

    const pedidoAtualizado = await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        status: novoStatus
      }
    });

    return res.json({
      pagamento: aprovado ? "APROVADO" : "RECUSADO",
      pedido: pedidoAtualizado
    });
  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao processar pagamento mock."
    });
  }
});

app.get("/pedidos", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      include: {
        itens: {
          include: {
            produto: true
          }
        },
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            role: true
          }
        }
      }
    });

    return res.json(pedidos);
  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao listar pedidos."
    });
  }
});

app.patch("/pedidos/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const statusPermitidos = ["PENDENTE", "PAGO", "PREPARANDO", "PRONTO", "ENTREGUE", "CANCELADO"];

    if (!statusPermitidos.includes(status)) {
      return res.status(422).json({
        error: "STATUS_INVALIDO",
        message: "Status informado não é permitido."
      });
    }

    const pedido = await prisma.pedido.update({
      where: { id: Number(id) },
      data: { status }
    });

    return res.json(pedido);
  } catch (error) {
    return res.status(500).json({
      error: "ERRO_INTERNO",
      message: "Erro ao atualizar status do pedido."
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});