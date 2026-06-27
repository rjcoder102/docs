import mongoose from 'mongoose';
import { type } from 'os';
import { deflate } from 'zlib';

const userSchema = new mongoose.Schema(
    {
        name: { 
            type: String, 
            required: true 
        },
        prefix: { 
            type: String, 
            required: true 
        },
        by: { 
        type: String, 
        default:"zapcore"
        },
        email: { 
            type: String, 
            required: true, unique: true 
        },
        phone:{
            type:Number,
        },
       domain:{
        type:String,
        default:""
        },
       ipv4_address:{
        type:[String],
        default:[]
        },
        ipv6_address:{
        type:[String],
        default:[]
        },
        password: { 
            type: String, 
            required: true 
        },
        role:{
            type:String,
            default:"user"
        },

        balance:{
            type:Number,
            default:0
        },
        cricketBalence:{
             type:Number,
            default:0
        },
        totalggr:{
            type:Number,
            default:0
        },
        todayggr:{
            type:Number,
            default:0
        },
        planpassword:{
        type:String
        },
        key:{
            type:String,
            unique:true
        },
        duepay:{
            type:String,
        },
        user_ggr:{
            type:Number
        },
        ggr_coust:{
            type:Number,
            default:12
        },
        todaybet:{
            type:Number
        },
        todaywin:{
            type:Number
        },
        nativetggr:{
            type:Number,
            default:0
        },
        isdemo:{
            type:Number,
            default:0
        },
        isActive:{
            type:Number,
            default:0
        },
        ggrupdatedate:{
            type:Date,
        }

    },
    { timestamps: true }
);

const User = mongoose.model('User', userSchema);
export default User;
