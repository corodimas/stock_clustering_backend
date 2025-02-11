import { Injectable, NotFoundException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schema/user.chema';
import { FilterQuery, Model } from 'mongoose';
import { hash, compare } from 'bcryptjs';
import { Types } from 'mongoose';
import { StockService } from '../stock/stock.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';

@Injectable()
export class UserService {

  constructor(
    @InjectModel(User.name) private readonly userModel : Model<User>,
    private readonly stockService: StockService
  ) {}

  async create(data: CreateUserDto) {
    await new this.userModel({ 
      ...data,
      password: await hash(data.password, 10)
     }).save();
  }

  async getUser(query: FilterQuery<User>){
    const user = (await this.userModel.findOne(query)).toObject();
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  async getUsers(){
    return this.userModel.find({})
  }

  async updateBookmark(userId: string, bookmarkId: Types.ObjectId) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
  
    user.bookmarks.push(bookmarkId);
    await user.save();
  }

  async addBookmarkToUser(userId: string, bookmarkId: Types.ObjectId): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $push: { bookmarks: bookmarkId },
    });
  }

  async removeBookmarkFromUser(userId: string, bookmarkId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { bookmarks: bookmarkId },
    });
  }

  async addFavoriteStock(userId: string, stockName: string) {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.favorite.includes(stockName)) {
        throw new Error('Stock is already in favorites');
      }

      user.favorite.push(stockName);
      await user.save();
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('Failed to add favorite stock');
    }
  }

  async removeFavoriteStock(userId: string, stockName: string) {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      user.favorite = user.favorite.filter(stock => stock !== stockName);
      await user.save();
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('Failed to remove favorite stock');
    }
  }

  async getFavoriteStocks(userId: string, page: number, limit: number, sortBy: string, sortOrder: 'asc' | 'desc') {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const favoriteStockNames = user.favorite.slice(startIndex, endIndex);
    const favoriteStocks = await Promise.all(
      favoriteStockNames.map(stockName => this.stockService.findBySymbol(stockName))
    );

    favoriteStocks.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a[sortBy] > b[sortBy] ? 1 : -1;
      } else {
        return a[sortBy] < b[sortBy] ? 1 : -1;
      }
    });

    return {
      total: user.favorite.length,
      page,
      limit,
      favoriteStocks,
    };
  }

  async updateUserProfile(userId: string, updateUserProfileDto: UpdateUserProfileDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserProfileDto.username) {
      user.username = updateUserProfileDto.username;
    }
    if (updateUserProfileDto.email) {
      user.email = updateUserProfileDto.email;
    }

    await user.save();
    return user;
  }

  async updateUserPassword(userId: string, updateUserPasswordDto: UpdateUserPasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const authenticated = await compare(updateUserPasswordDto.currentPassword, user.password);
    if (!authenticated) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.password = await hash(updateUserPasswordDto.newPassword, 10);
    await user.save();
    return user;
  }
}
