package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Teacher;

/**
 * 教师 数据访问对象(DAO)。
 *
 * <p>封装对 teacher 表的增删改查。所有动态值均使用
 * {@link PreparedStatement} 参数占位，避免 SQL 注入。</p>
 */
public class TeacherDao {

    /**
     * 查询所有教师（按教师号排序）。
     *
     * @return 教师列表
     */
    public List<Teacher> findAll() {
        List<Teacher> list = new ArrayList<>();
        String sql = "SELECT teacher_id, teacher_name, dept_id FROM teacher ORDER BY teacher_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询教师失败", e);
        }
        return list;
    }

    /**
     * 按教师号查询。
     *
     * @param teacherId 教师号
     * @return 教师实体；不存在返回 null
     */
    public Teacher findById(String teacherId) {
        String sql = "SELECT teacher_id, teacher_name, dept_id FROM teacher WHERE teacher_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, teacherId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapRow(rs);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("按教师号查询失败", e);
        }
        return null;
    }

    /** 统计教师总数。 */
    public int count() {
        String sql = "SELECT COUNT(*) FROM teacher";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (Exception e) {
            throw new RuntimeException("统计教师数失败", e);
        }
    }

    /**
     * 新增教师。
     *
     * @param t 教师实体
     * @return 影响行数
     */
    public int insert(Teacher t) {
        String sql = "INSERT INTO teacher(teacher_id, teacher_name, dept_id) VALUES(?, ?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, t.getTeacherId());
            ps.setString(2, t.getTeacherName());
            ps.setString(3, t.getDeptId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增教师失败（教师号可能重复或系号不存在）", e);
        }
    }

    /**
     * 更新教师。
     *
     * @param t 教师实体
     * @return 影响行数
     */
    public int update(Teacher t) {
        String sql = "UPDATE teacher SET teacher_name = ?, dept_id = ? WHERE teacher_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, t.getTeacherName());
            ps.setString(2, t.getDeptId());
            ps.setString(3, t.getTeacherId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新教师失败", e);
        }
    }

    /**
     * 删除教师。若其仍有授课记录或为学生导师，则受外键约束限制。
     *
     * @param teacherId 教师号
     * @return 影响行数
     */
    public int delete(String teacherId) {
        String sql = "DELETE FROM teacher WHERE teacher_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, teacherId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除教师失败（可能存在关联授课记录）", e);
        }
    }

    private Teacher mapRow(ResultSet rs) throws Exception {
        Teacher t = new Teacher();
        t.setTeacherId(rs.getString("teacher_id"));
        t.setTeacherName(rs.getString("teacher_name"));
        t.setDeptId(rs.getString("dept_id"));
        return t;
    }
}
