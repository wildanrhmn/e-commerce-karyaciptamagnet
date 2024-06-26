"use server";

import bcrypt from "bcrypt";
import cloudinary from "./cloudinary";

import { IFormRegisterInput } from "@/app/auth/signup/RegisterForm";
import { IFormLoginInput } from "@/app/auth/signin/LoginForm";
import { IFormContactInput } from "@/app/store/myaccount/[id]/addresses/DialogCreate";

import { AuthError } from "next-auth";
import { prisma } from "./db/prisma";
import { signIn, auth } from "@/auth";

import { revalidatePath } from 'next/cache';

async function uploadImage(data: File) {
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'karyaciptamagnet/user_pictures' }, function (error, result) {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        })
            .end(buffer);
    });
}

export async function SignInAction(formData: IFormLoginInput) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return { success: false, message: 'Invalid email or password' };
                default:
                    return { success: false, message: 'Unknown error.' };
            }
        }
    }
    return { success: true, message: 'Successfully logged in.' };
}

export async function SignUpAction(formData: IFormRegisterInput) {
    const { username, password, email, phone } = formData;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                phoneNumber: phone
            }
        })
            .then(async () => {
                const credentials = {
                    email,
                    password
                }
                await signIn('credentials', credentials);
            });
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Unknown error.' };
    }
    return { success: true, message: 'Successfully registered.' }
}

export async function CreateNewAddress(formData: IFormContactInput) {
    const session = await auth();
    const { provinceId, cityId, addressTo, fullAddress } = formData;

    try {
        await prisma.addresses.create({
            data: {
                userId: session?.user.id,
                provinceId,
                cityId,
                addressTo,
                fullAddress
            }
        })
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Unknown error.' };
    }
    revalidatePath('/store/myaccount/[id]/addresses', 'page')
    return { success: true, message: 'Successfully created new address.' }
}

export async function EditAddress(addressId: string, formData: IFormContactInput) {
    const { provinceId, cityId, addressTo, fullAddress } = formData;
    try {
        await prisma.addresses.update({
            where: {
                id: addressId
            },
            data: {
                provinceId,
                cityId,
                addressTo,
                fullAddress
            }
        })
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Unknown error.' };
    }
    revalidatePath('/store/myaccount/[id]/addresses', 'page')
    return { success: true, message: 'Successfully edit address.' }
}

export async function DeleteAddress(addressId: string) {
    try {
        await prisma.addresses.delete({
            where: {
                id: addressId
            }
        })
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Unknown error.' };
    }
    revalidatePath('/store/myaccount/[id]/addresses', 'page')
    return { success: true, message: 'Successfully delete address.' }
}

export async function SetActiveAddress(newId: string) {
    try {
        await prisma.addresses.updateMany({
            where: {
                NOT: {
                    id: newId
                },
                isActive: true
            },
            data: {
                isActive: false
            }
        });

        await prisma.addresses.update({
            where: {
                id: newId
            },
            data: {
                isActive: true
            }
        });
    } catch (error) {
        console.log(error);
        return { success: false, message: 'Unknown error.' };
    }
    revalidatePath('/store/myaccount/[id]/addresses', 'page')
    return { success: true, message: 'Successfully set new active address.' }
}

export async function UpdateProfile(formData: FormData) {
    const session = await auth();

    const id = session?.user.id;

    const username = formData.get('username') as string;
    const fullName = formData.get('fullName') as string;
    const phone = formData.get('phone') as string;
    const file = formData.get('image') as File;
    const oldImage = JSON.parse(formData.get('oldImage') as string);

    let imageData: any;
    if (typeof file === 'string') {
        imageData = JSON.stringify(oldImage);
    } else {
        imageData = await uploadImage(file).then((result: any) => {
            return JSON.stringify({
                url: result.url,
                public_id: result.public_id
            });
        });
    }

    try {
        await prisma.user.update({
            where: {
                id
            },
            data: {
                name: fullName,
                username,
                phoneNumber: phone,
                image: imageData,
                updatedAt: new Date()
            }
        })
    } catch (error) {
        return { success: false, message: error };
    }
    if (oldImage.public_id) {
        await cloudinary.uploader.destroy(oldImage.public_id);
    }
    revalidatePath('/store/myaccount/[id]/profile', 'page');
    return { success: true, message: `Successfully updated.` }
}