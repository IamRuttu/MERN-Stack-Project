const express = require('express');
let cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
mongoose.connect('mongodb://localhost:27017/Transactions', { useNewUrlParser: true, useUnifiedTopology: true });

const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    category: String,
    dateOfSale: Date,
    sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);

app.get('/initialize', async (req, res) => {
    try {
        const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Transaction.insertMany(data);
        res.send('Database initialized');
    } catch (error) {
        res.status(500).send(error);
    }
});

app.get('/transactions', async (req, res) => {
    const { page = 1, perPage = 10, search = '' } = req.query;
    const regex = new RegExp(search, 'i');
    const transactions = await Transaction.find({
        $or: [
            { title: regex },
            { description: regex },
            { price: regex }
        ]
    })
    .skip((page - 1) * perPage)
    .limit(parseInt(perPage));
    res.send(transactions);
});

app.get('/statistics', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const totalSales = await Transaction.aggregate([
        { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: null, total: { $sum: "$price" } } }
    ]);

    const soldItems = await Transaction.countDocuments({ dateOfSale: { $gte: startDate, $lt: endDate }, sold: true });
    const notSoldItems = await Transaction.countDocuments({ dateOfSale: { $gte: startDate, $lt: endDate }, sold: false });

    res.send({
        totalSales: totalSales[0]?.total || 0,
        soldItems,
        notSoldItems
    });
});

app.get('/barchart', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const ranges = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const rangeCounts = await Transaction.aggregate([
        { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
        {
            $bucket: {
                groupBy: "$price",
                boundaries: [...ranges, Infinity],
                default: "Other",
                output: { count: { $sum: 1 } }
            }
        }
    ]);

    res.send(rangeCounts);
});

app.get('/piechart', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const categories = await Transaction.aggregate([
        { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

    res.send(categories);
});

app.get('/combined', async (req, res) => {
    const { month } = req.query;
    const [transactions, statistics, barChart, pieChart] = await Promise.all([
        Transaction.find({ dateOfSale: { $gte: new Date(`2023-${month}-01`), $lt: new Date(`2023-${parseInt(month) + 1}-01`) } }),
        Transaction.aggregate([
            { $match: { dateOfSale: { $gte: new Date(`2023-${month}-01`), $lt: new Date(`2023-${parseInt(month) + 1}-01`) } } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]),
        Transaction.aggregate([
            { $match: { dateOfSale: { $gte: new Date(`2023-${month}-01`), $lt: new Date(`2023-${parseInt(month) + 1}-01`) } } },
            {
                $bucket: {
                    groupBy: "$price",
                    boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
                    default: "Other",
                    output: { count: { $sum: 1 } }
                }
            }
        ]),
        Transaction.aggregate([
            { $match: { dateOfSale: { $gte: new Date(`2023-${month}-01`), $lt: new Date(`2023-${parseInt(month) + 1}-01`) } } },
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ])
    ]);

    res.send({ transactions, statistics, barChart, pieChart });
});



app.listen(5000, () => console.log('Server running on port 5000'));


